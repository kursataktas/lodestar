import {setMaxListeners} from "node:events";
import {Libp2p} from "libp2p";
import {Registry} from "prom-client";

import {IBeaconConfig} from "@lodestar/config";
import {phase0} from "@lodestar/types";
import {ILogger} from "@lodestar/utils";
import {Api} from "@lodestar/api";
import {BeaconStateAllForks} from "@lodestar/state-transition";
import {ProcessShutdownCallback} from "@lodestar/validator";

import {INetwork, Network, getReqRespHandlers} from "@lodestar/beacon-node/network";
import {createMetrics, IMetrics} from "@lodestar/beacon-node/metrics";
import {HttpMetricsServer, IBeaconDb} from "@lodestar/beacon-node";
import {BeaconChain, IBeaconChain, initBeaconMetrics} from "@lodestar/beacon-node/chain";
import {createLibp2pMetrics} from "@lodestar/beacon-node/metrics/metrics/libp2p";
import {initializeEth1ForBlockProduction} from "@lodestar/beacon-node/eth1";
import {initializeExecutionBuilder, initializeExecutionEngine} from "@lodestar/beacon-node/execution";
import {BeaconSync, IBeaconSync} from "@lodestar/beacon-node/sync";
import {BeaconRestApiServer, getApi} from "@lodestar/beacon-node/api";
import {runNodeNotifier} from "@lodestar/beacon-node/node/notifier";
import {LightSync} from "../sync/lightSync/index.js";
import {IBeaconNodeOptions} from "./options.js";

export * from "./options.js";

export interface IBeaconNodeModules {
  opts: IBeaconNodeOptions;
  config: IBeaconConfig;
  db: IBeaconDb;
  metrics: IMetrics | null;
  network: INetwork;
  chain: IBeaconChain;
  api: Api;
  sync: IBeaconSync;
  backfillSync: LightSync | null;
  metricsServer?: HttpMetricsServer;
  restApi?: BeaconRestApiServer;
  controller?: AbortController;
}

export interface IBeaconNodeInitModules {
  opts: IBeaconNodeOptions;
  config: IBeaconConfig;
  db: IBeaconDb;
  logger: ILogger;
  processShutdownCallback: ProcessShutdownCallback;
  libp2p: Libp2p;
  anchorState: BeaconStateAllForks;
  wsCheckpoint?: phase0.Checkpoint;
  metricsRegistries?: Registry[];
  lcCheckpointRoot: string;
}

export enum BeaconNodeStatus {
  started = "started",
  closing = "closing",
  closed = "closed",
}

enum LoggerModule {
  api = "api",
  backfill = "backfill",
  lightClient = "lightClient",
  chain = "chain",
  eth1 = "eth1",
  metrics = "metrics",
  network = "network",
  /** validator monitor */
  vmon = "vmon",
  rest = "rest",
  sync = "sync",
}

/**
 * The main Beacon Node class.  Contains various components for getting and processing data from the
 * Ethereum Consensus ecosystem as well as systems for getting beacon node metadata.
 */
export class BeaconNodeLight {
  opts: IBeaconNodeOptions;
  config: IBeaconConfig;
  db: IBeaconDb;
  metrics: IMetrics | null;
  metricsServer?: HttpMetricsServer;
  network: INetwork;
  chain: IBeaconChain;
  api: Api;
  restApi?: BeaconRestApiServer;
  sync: IBeaconSync;
  backfillSync: LightSync | null;

  status: BeaconNodeStatus;
  private controller?: AbortController;

  constructor({
    opts,
    config,
    db,
    metrics,
    metricsServer,
    network,
    chain,
    api,
    restApi,
    sync,
    backfillSync,
    controller,
  }: IBeaconNodeModules) {
    this.opts = opts;
    this.config = config;
    this.metrics = metrics;
    this.metricsServer = metricsServer;
    this.db = db;
    this.chain = chain;
    this.api = api;
    this.restApi = restApi;
    this.network = network;
    this.sync = sync;
    this.backfillSync = backfillSync;
    this.controller = controller;

    this.status = BeaconNodeStatus.started;
  }

  /**
   * Initialize a beacon node.  Initializes and `start`s the varied sub-component services of the
   * beacon node
   */
  static async init<T extends BeaconNodeLight = BeaconNodeLight>({
    opts,
    config,
    db,
    logger,
    processShutdownCallback,
    libp2p,
    anchorState,
    wsCheckpoint,
    metricsRegistries = [],
    lcCheckpointRoot, // TODO DA propertly add this to cli options.
  }: IBeaconNodeInitModules): Promise<T> {
    const controller = new AbortController();
    // We set infinity to prevent MaxListenersExceededWarning which get logged when listeners > 10
    // Since it is perfectly fine to have listeners > 10
    setMaxListeners(Infinity, controller.signal);
    const signal = controller.signal;

    // start db if not already started
    await db.start();

    let metrics = null;
    if (opts.metrics.enabled) {
      metrics = createMetrics(
        opts.metrics,
        config,
        anchorState,
        logger.child({module: LoggerModule.vmon}),
        metricsRegistries
      );
      initBeaconMetrics(metrics, anchorState);
      // Since the db is instantiated before this, metrics must be injected manually afterwards
      db.setMetrics(metrics.db);
      createLibp2pMetrics(libp2p, metrics.register);
    }

    const chain = new BeaconChain(opts.chain, {
      config,
      db,
      logger: logger.child({module: LoggerModule.chain}),
      processShutdownCallback,
      metrics,
      anchorState,
      eth1: initializeEth1ForBlockProduction(opts.eth1, {
        config,
        db,
        metrics,
        logger: logger.child({module: LoggerModule.eth1}),
        signal,
      }),
      executionEngine: initializeExecutionEngine(opts.executionEngine, {metrics, signal}),
      executionBuilder: opts.executionBuilder.enabled
        ? initializeExecutionBuilder(opts.executionBuilder, config)
        : undefined,
    });

    // TODO DA POC. Delete later
    // const chain = new LightChain(opts.chain, {
    //   config,
    //   db,
    //   logger: logger.child({module: LoggerModule.chain}),
    //   processShutdownCallback,
    //   metrics,
    //   anchorState,
    //   eth1: initializeEth1ForBlockProduction(opts.eth1, {
    //     config,
    //     db,
    //     metrics,
    //     logger: logger.child({module: LoggerModule.eth1}),
    //     signal,
    //   }),
    //   executionEngine: initializeExecutionEngine(opts.executionEngine, {metrics, signal}),
    //   executionBuilder: opts.executionBuilder.enabled
    //     ? initializeExecutionBuilder(opts.executionBuilder, config)
    //     : undefined,
    // });

    // Load persisted data from disk to in-memory caches
    await chain.loadFromDisk();

    const network = new Network(opts.network, {
      config,
      libp2p,
      logger: logger.child({module: LoggerModule.network}),
      metrics,
      chain,
      reqRespHandlers: getReqRespHandlers({db, chain}),
      signal,
    });

    // Network needs to start before the sync
    // See https://github.com/ChainSafe/lodestar/issues/4543
    await network.start();

    const sync = new BeaconSync(opts.sync, {
      config,
      db,
      chain,
      metrics,
      network,
      wsCheckpoint,
      logger: logger.child({module: LoggerModule.sync}),
    });

    const api = getApi(opts.api, {
      config,
      logger: logger.child({module: LoggerModule.api}),
      db,
      sync,
      network,
      chain,
      metrics,
    });

    // TODO DA POC. Delete later
    // const {data: genesisData} = await api.beacon.getGenesis();
    // const lightClientSync = await LightSync.init(
    //   {
    //     checkpointRoot: fromHexString(lcCheckpointRoot),
    //     genesisData: {
    //       genesisTime: Number(genesisData.genesisTime),
    //       genesisValidatorsRoot: genesisData.genesisValidatorsRoot,
    //     },
    //   },
    //   {
    //     chain,
    //     config,
    //     db,
    //     metrics,
    //     network,
    //     logger: logger.child({module: LoggerModule.lightClient}),
    //     signal,
    //   }
    // );

    const metricsServer = metrics
      ? new HttpMetricsServer(opts.metrics, {
          register: metrics.register,
          logger: logger.child({module: LoggerModule.metrics}),
        })
      : undefined;
    if (metricsServer) {
      await metricsServer.start();
    }

    const restApi = new BeaconRestApiServer(opts.api.rest, {
      config,
      logger: logger.child({module: LoggerModule.rest}),
      api,
      metrics: metrics ? metrics.apiRest : null,
    });
    if (opts.api.rest.enabled) {
      await restApi.listen();
    }

    void runNodeNotifier({network, chain, sync, config, logger, signal});

    return new this({
      opts,
      config,
      db,
      metrics,
      metricsServer,
      network,
      chain,
      api,
      restApi,
      sync,
      backfillSync: null, // TODO DA revisit
      controller,
    }) as T;
  }

  /**
   * Stop beacon node and its sub-components.
   */
  async close(): Promise<void> {
    if (this.status === BeaconNodeStatus.started) {
      this.status = BeaconNodeStatus.closing;
      this.sync.close();
      this.backfillSync?.close();
      await this.network.stop();
      if (this.metricsServer) await this.metricsServer.stop();
      if (this.restApi) await this.restApi.close();

      await this.chain.persistToDisk();
      await this.chain.close();
      await this.db.stop();
      if (this.controller) this.controller.abort();
      this.status = BeaconNodeStatus.closed;
    }
  }
}
