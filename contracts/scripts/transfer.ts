import { ethers } from 'hardhat'

async function main() {
  const [signer] = await ethers.getSigners()
  const to = '0xc981d073a309b7ab3f25705681670d21138db522'
  const amount = ethers.parseEther('0.05')

  console.log(`From: ${signer.address}`)
  console.log(`To:   ${to} (Agentic Wallet)`)
  console.log(`Amount: 0.05 OKB`)

  const tx = await signer.sendTransaction({ to, value: amount })
  const receipt = await tx.wait()
  console.log(`\nTX: ${receipt!.hash}`)

  const balance = await ethers.provider.getBalance(to)
  console.log(`Agentic Wallet balance: ${ethers.formatEther(balance)} OKB`)
}

main().catch(console.error)
