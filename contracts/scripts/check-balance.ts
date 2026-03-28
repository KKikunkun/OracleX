import { ethers } from 'hardhat'

async function main() {
  const [creator, resolver] = await ethers.getSigners()
  console.log('Creator address:', creator.address)
  const balance = await ethers.provider.getBalance(creator.address)
  console.log('Balance:', ethers.formatEther(balance), 'OKB')

  if (balance === 0n) {
    console.log('\n⚠️  Balance is 0. Please fund this address with OKB before deploying.')
  } else {
    console.log('\n✓ Ready to deploy')
  }
}

main().catch(console.error)
