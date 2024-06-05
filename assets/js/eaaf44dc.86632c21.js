"use strict";(self.webpackChunk_lodestar_docs=self.webpackChunk_lodestar_docs||[]).push([[5407],{2973:(e,t,i)=>{i.r(t),i.d(t,{assets:()=>a,contentTitle:()=>r,default:()=>d,frontMatter:()=>o,metadata:()=>l,toc:()=>c});var n=i(4848),s=i(8453);const o={},r="Lodestar Light Client",l={id:"lightclient-prover/lightclient",title:"Lodestar Light Client",description:"Ethereum light clients provide a pathway for users to interact with the Ethereum blockchain in a trust-minimized manner, comparable to the level of trust required when engaging with a third-party provider like Infura or EtherScan. Not that those platforms are bad, but trust in any centralized provider goes against the ethos of blockchain. Light clients are a way that low-power devices, like cell phones, can do self validation of transactions and dApp state.",source:"@site/pages/lightclient-prover/lightclient.md",sourceDirName:"lightclient-prover",slug:"/lightclient-prover/lightclient",permalink:"/lodestar/lightclient-prover/lightclient",draft:!1,unlisted:!1,editUrl:"https://github.com/ChainSafe/lodestar/tree/unstable/docs/pages/lightclient-prover/lightclient.md",tags:[],version:"current",frontMatter:{},sidebar:"tutorialSidebar",previous:{title:"CLI Reference",permalink:"/lodestar/lightclient-prover/lightclient-cli"},next:{title:"Lodestar Eth Consensus Lightclient Prover",permalink:"/lodestar/lightclient-prover/prover"}},a={},c=[{value:"Prerequisites",id:"prerequisites",level:2},{value:"Requirements for Running a Light-Client",id:"requirements-for-running-a-light-client",level:2},{value:"Getting started",id:"getting-started",level:2},{value:"Light-Client CLI Example",id:"light-client-cli-example",level:2},{value:"Light-Client Programmatic Example",id:"light-client-programmatic-example",level:2},{value:"Browser Integration",id:"browser-integration",level:2},{value:"Contributors",id:"contributors",level:2},{value:"License",id:"license",level:2}];function h(e){const t={a:"a",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",img:"img",li:"li",p:"p",pre:"pre",ul:"ul",...(0,s.R)(),...e.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(t.h1,{id:"lodestar-light-client",children:"Lodestar Light Client"}),"\n",(0,n.jsx)(t.p,{children:"Ethereum light clients provide a pathway for users to interact with the Ethereum blockchain in a trust-minimized manner, comparable to the level of trust required when engaging with a third-party provider like Infura or EtherScan. Not that those platforms are bad, but trust in any centralized provider goes against the ethos of blockchain. Light clients are a way that low-power devices, like cell phones, can do self validation of transactions and dApp state."}),"\n",(0,n.jsx)(t.p,{children:"Unlike full nodes, light clients do not download and store the entire blockchain. Instead, they download only the headers of each block and employ Merkle proofs to verify transactions. This enables a quick synchronization with the network and access the latest information without using significant system resources\u200b. This streamlined approach to accessing Ethereum is crucial, especially in scenarios where full-scale network participation is infeasible or undesired."}),"\n",(0,n.jsx)(t.p,{children:"The evolution of light clients is emblematic of the broader trajectory of Ethereum towards becoming more accessible and resource-efficient, making blockchain technology more inclusive and adaptable to a wide array of use cases and environments. The Altair hard fork introduced sync committees to allow light-clients to synchronize to the network."}),"\n",(0,n.jsx)(t.h2,{id:"prerequisites",children:"Prerequisites"}),"\n",(0,n.jsxs)(t.p,{children:[(0,n.jsx)(t.a,{href:"https://discord.gg/aMxzVcr",children:(0,n.jsx)(t.img,{src:"https://img.shields.io/discord/593655374469660673.svg?label=Discord&logo=discord",alt:"Discord"})}),"\n",(0,n.jsx)(t.a,{href:"https://github.com/ethereum/consensus-specs/releases/tag/v1.4.0",children:(0,n.jsx)(t.img,{src:"https://img.shields.io/badge/ETH%20consensus--spec-1.4.0-blue",alt:"Eth Consensus Spec v1.4.0"})}),"\n",(0,n.jsx)(t.img,{src:"https://img.shields.io/badge/ES-2021-yellow",alt:"ES Version"}),"\n",(0,n.jsx)(t.img,{src:"https://img.shields.io/badge/node-16.x-green",alt:"Node Version"}),"\n",(0,n.jsx)(t.img,{src:"https://img.shields.io/badge/yarn-%232C8EBB.svg?style=for-the-badge&logo=yarn&logoColor=white",alt:"Yarn"})]}),"\n",(0,n.jsxs)(t.blockquote,{children:["\n",(0,n.jsxs)(t.p,{children:["This package is part of ",(0,n.jsx)(t.a,{href:"https://lodestar.chainsafe.io",children:"ChainSafe's Lodestar"})," project"]}),"\n"]}),"\n",(0,n.jsx)(t.h2,{id:"requirements-for-running-a-light-client",children:"Requirements for Running a Light-Client"}),"\n",(0,n.jsxs)(t.p,{children:["Access to an beacon node that supports the light client specification is necessary. The client must support the following routes from the ",(0,n.jsx)(t.a,{href:"https://github.com/ethereum/consensus-specs/tree/dev",children:"consensus API spec"}),":"]}),"\n",(0,n.jsxs)(t.ul,{children:["\n",(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:"/eth/v1/beacon/light_client/updates"})}),"\n",(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:"/eth/v1/beacon/light_client/optimistic_update"})}),"\n",(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:"/eth/v1/beacon/light_client/finality_update"})}),"\n",(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:"/eth/v1/beacon/light_client/bootstrap/{block_root}"})}),"\n",(0,n.jsx)(t.li,{children:(0,n.jsx)(t.code,{children:"/eth/v0/beacon/light_client/committee_root"})}),"\n"]}),"\n",(0,n.jsxs)(t.p,{children:["System requirements are quite low so its possible to run a light client in the browser as part of a website. There are a few examples of this on github that you can use as reference, our ",(0,n.jsx)(t.a,{href:"https://chainsafe.github.io/lodestar/lightclient-prover/prover",children:"prover"})," being one of them."]}),"\n",(0,n.jsxs)(t.p,{children:["You can find more information about the light-client protocol in the ",(0,n.jsx)(t.a,{href:"https://github.com/ethereum/consensus-specs",children:"specification"}),"."]}),"\n",(0,n.jsx)(t.h2,{id:"getting-started",children:"Getting started"}),"\n",(0,n.jsxs)(t.ul,{children:["\n",(0,n.jsxs)(t.li,{children:["Follow the ",(0,n.jsx)(t.a,{href:"https://chainsafe.github.io/lodestar/getting-started/installation",children:"installation guide"})," or ",(0,n.jsx)(t.a,{href:"https://chainsafe.github.io/lodestar/getting-started/installation/#docker-installation",children:"Docker install"})," to install Lodestar."]}),"\n",(0,n.jsxs)(t.li,{children:["Quickly try out the whole stack by ",(0,n.jsx)(t.a,{href:"https://chainsafe.github.io/lodestar/advanced-topics/setting-up-a-testnet",children:"starting a local testnet"}),"."]}),"\n"]}),"\n",(0,n.jsx)(t.h2,{id:"light-client-cli-example",children:"Light-Client CLI Example"}),"\n",(0,n.jsx)(t.p,{children:"It is possible to start up the light-client as a standalone process."}),"\n",(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-bash",children:'lodestar lightclient \\\n    --network sepolia \\\n    --beacon-api-url https://lodestar-sepolia.chainsafe.io \\\n    --checkpoint-root "0xccaff4b99986a7b05e06738f1828a32e40799b277fd9f9ff069be55341fe0229"\n'})}),"\n",(0,n.jsx)(t.h2,{id:"light-client-programmatic-example",children:"Light-Client Programmatic Example"}),"\n",(0,n.jsxs)(t.p,{children:["For this example we will assume there is a running beacon node at ",(0,n.jsx)(t.code,{children:"https://lodestar-sepolia.chainsafe.io"})]}),"\n",(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-ts",children:'import {Lightclient, LightclientEvent} from "@lodestar/light-client";\nimport {LightClientRestTransport} from "@lodestar/light-client/transport";\nimport {\n  getFinalizedSyncCheckpoint,\n  getGenesisData,\n  getConsoleLogger,\n  getApiFromUrl,\n  getChainForkConfigFromNetwork,\n} from "@lodestar/light-client/utils";\n\nconst config = getChainForkConfigFromNetwork("sepolia");\nconst logger = getConsoleLogger({logDebug: Boolean(process.env.DEBUG)});\nconst api = getApiFromUrl({urls: ["https://lodestar-sepolia.chainsafe.io"]}, {config});\n\nconst lightclient = await Lightclient.initializeFromCheckpointRoot({\n  config,\n  logger,\n  transport: new LightClientRestTransport(api),\n  genesisData: await getGenesisData(api),\n  checkpointRoot: await getFinalizedSyncCheckpoint(api),\n  opts: {\n    allowForcedUpdates: true,\n    updateHeadersOnForcedUpdate: true,\n  },\n});\n\n// Wait for the lightclient to start\nawait lightclient.start();\n\nlogger.info("Lightclient synced");\n\nlightclient.emitter.on(LightclientEvent.lightClientFinalityHeader, async (finalityUpdate) => {\n  logger.info(finalityUpdate);\n});\n\nlightclient.emitter.on(LightclientEvent.lightClientOptimisticHeader, async (optimisticUpdate) => {\n  logger.info(optimisticUpdate);\n});\n'})}),"\n",(0,n.jsx)(t.h2,{id:"browser-integration",children:"Browser Integration"}),"\n",(0,n.jsxs)(t.p,{children:["If you want to use Lightclient in browser and facing some issues in building it with bundlers like webpack, vite. We suggest to use our distribution build. The support for single distribution build is started from ",(0,n.jsx)(t.code,{children:"1.19.0"})," version."]}),"\n",(0,n.jsxs)(t.p,{children:["Directly link the dist build with the ",(0,n.jsx)(t.code,{children:"<script />"})," tag with tools like unpkg or other. e.g."]}),"\n",(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-html",children:'<script src="https://www.unpkg.com/@lodestar/light-client@1.18.0/dist/lightclient.es.min.js" type="module">\n'})}),"\n",(0,n.jsxs)(t.p,{children:["Then the lightclient package will be exposed to ",(0,n.jsx)(t.code,{children:"globalThis"}),", in case of browser environment that will be ",(0,n.jsx)(t.code,{children:"window"}),". You can access the package as ",(0,n.jsx)(t.code,{children:"window.lodestar.lightclient"}),". All named exports will also be available from this interface. e.g. ",(0,n.jsx)(t.code,{children:"window.lodestar.lightclient.transport"}),"."]}),"\n",(0,n.jsxs)(t.p,{children:["NOTE: Due to ",(0,n.jsx)(t.code,{children:"top-level-await"})," used in one of dependent library, the package will not be available right after the load. You have to use a hack to clear up that await from the event loop."]}),"\n",(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-html",children:'<script>\n  window.addEventListener("DOMContentLoaded", () => {\n    setTimeout(function () {\n      // here you can access the Lightclient\n      // window.lodestar.lightclient\n    }, 50);\n  });\n<\/script>\n\n**Typescript support** The web bundle comes with the types support. Unfortunately due to following\n[issue](https://github.com/microsoft/rushstack/issues/1128#issuecomment-2066257538) we can\'t bundle all types. A\nworkaround would be to add `@chainsafe/as-sha256` as a devDependency to your project.\n'})}),"\n",(0,n.jsx)(t.h2,{id:"contributors",children:"Contributors"}),"\n",(0,n.jsxs)(t.p,{children:["Read our ",(0,n.jsx)(t.a,{href:"https://chainsafe.github.io/lodestar/contribution/getting-started",children:"contribution documentation"}),", ",(0,n.jsx)(t.a,{href:"https://github.com/ChainSafe/lodestar/issues/new/choose",children:"submit an issue"})," or talk to us on our ",(0,n.jsx)(t.a,{href:"https://discord.gg/yjyvFRP",children:"discord"}),"!"]}),"\n",(0,n.jsx)(t.h2,{id:"license",children:"License"}),"\n",(0,n.jsxs)(t.p,{children:["Apache-2.0 ",(0,n.jsx)(t.a,{href:"https://chainsafe.io",children:"ChainSafe Systems"})]})]})}function d(e={}){const{wrapper:t}={...(0,s.R)(),...e.components};return t?(0,n.jsx)(t,{...e,children:(0,n.jsx)(h,{...e})}):h(e)}},8453:(e,t,i)=>{i.d(t,{R:()=>r,x:()=>l});var n=i(6540);const s={},o=n.createContext(s);function r(e){const t=n.useContext(o);return n.useMemo((function(){return"function"==typeof e?e(t):{...t,...e}}),[t,e])}function l(e){let t;return t=e.disableParentContext?"function"==typeof e.components?e.components(s):e.components||s:r(e.components),n.createElement(o.Provider,{value:t},e.children)}}}]);