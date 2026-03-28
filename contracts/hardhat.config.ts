import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Hardhat default accounts[0] private key — only used for local/test, never on mainnet
const DUMMY_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
function resolveKey(envVal?: string): string {
  if (!envVal || envVal.length < 64 || envVal.includes('_your_')) return DUMMY_KEY
  return envVal
}
const CREATOR_KEY  = resolveKey(process.env.CREATOR_PRIVATE_KEY)
const RESOLVER_KEY = resolveKey(process.env.RESOLVER_PRIVATE_KEY)

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // X Layer Mainnet
    xlayer: {
      url: 'https://rpc.xlayer.tech',
      chainId: 196,
      accounts: [CREATOR_KEY, RESOLVER_KEY],
    },
    // X Layer Testnet
    xlayerTestnet: {
      url: 'https://testrpc.xlayer.tech',
      chainId: 195,
      accounts: [CREATOR_KEY, RESOLVER_KEY],
    },
    hardhat: {
      chainId: 31337,
    },
  },
  paths: {
    sources:   './contracts',
    tests:     './test',
    cache:     './cache',
    artifacts: './artifacts',
  },
}

export default config
