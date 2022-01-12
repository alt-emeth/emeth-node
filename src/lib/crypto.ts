import { ethers } from 'ethers'
import { joinSignature } from '@ethersproject/bytes'

const hexStringFull = (value: string) => {
  return (!value || typeof(value) !== 'string' || value.match(/^0x/)) ? value : '0x' + value;
}

export async function sign (types: string[], values: any[], wallet: ethers.Wallet): Promise<string> {
  const hash = ethers.utils.solidityKeccak256(types, values)
  const signature = await wallet._signingKey().signDigest(hash)

  return joinSignature(signature)
}

export function verify(types: string[], values: any[], signer:string, signature:string) {
  const hash = ethers.utils.solidityKeccak256(types, values)
  const signedAddress = ethers.utils.recoverAddress(hash, signature)

  return (hexStringFull(signedAddress).toLowerCase() === hexStringFull(signer).toLowerCase())
}