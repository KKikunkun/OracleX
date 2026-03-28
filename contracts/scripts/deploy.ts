import { ethers } from 'hardhat'

/**
 * OracleX — MarketFactory 部署脚本
 *
 * 用法:
 *   pnpm --filter contracts deploy:testnet   → X Layer Testnet (195)
 *   pnpm --filter contracts deploy:mainnet   → X Layer Mainnet (196)
 *
 * 前置条件:
 *   .env 中设置 CREATOR_PRIVATE_KEY / RESOLVER_PRIVATE_KEY / PLATFORM_WALLET
 */
async function main() {
  const signers = await ethers.getSigners()
  const creator  = signers[0]
  const resolver = signers[1] ?? signers[0]  // same wallet if only one key provided
  const network  = await ethers.provider.getNetwork()

  const platformWallet = process.env.PLATFORM_WALLET || creator.address

  console.log('=== OracleX MarketFactory 部署 ===')
  console.log(`Chain ID:       ${network.chainId}`)
  console.log(`Creator Agent:  ${creator.address}`)
  console.log(`Resolver Agent: ${resolver.address}`)
  console.log(`Platform Wallet:${platformWallet}`)

  const balance = await ethers.provider.getBalance(creator.address)
  console.log(`Creator Balance:${ethers.formatEther(balance)} OKB\n`)

  if (balance < ethers.parseEther('0.01')) {
    console.error('❌ Balance too low. Need at least 0.01 OKB for deployment.')
    process.exit(1)
  }

  console.log('Deploying MarketFactory...')
  const Factory = await ethers.getContractFactory('MarketFactory')
  const factory = await Factory.deploy(
    creator.address,
    resolver.address,
    platformWallet
  )
  await factory.waitForDeployment()

  const factoryAddress = await factory.getAddress()
  const deployTx       = factory.deploymentTransaction()

  console.log(`\n✅ MarketFactory deployed!`)
  console.log(`   Address:  ${factoryAddress}`)
  console.log(`   TX Hash:  ${deployTx?.hash}`)

  const isMainnet = Number(network.chainId) === 196
  const explorer  = isMainnet
    ? 'https://www.oklink.com/xlayer'
    : 'https://www.oklink.com/xlayer-test'

  console.log(`   Explorer: ${explorer}/address/${factoryAddress}`)

  console.log('\n' + '='.repeat(60))
  console.log('Add to .env:')
  console.log('='.repeat(60))
  console.log(`FACTORY_ADDRESS=${factoryAddress}`)
  console.log(`NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`)
  console.log('\n=== Deployment complete ===')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
