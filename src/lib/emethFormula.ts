import { BigNumber } from 'ethers'
import { Emeth } from '../types/contracts'

export const computeRequiredPowerCapacity = (gas:number, timeLimit:number): number => {
  return BigNumber.from(gas).mul(BigNumber.from(1000000)).div(BigNumber.from(timeLimit)).toNumber()
}

export const estimateGas = async(datasetSizeMB: number, algorithmComplexity: number, emeth:Emeth) => {
  if(datasetSizeMB <= 0) {
    datasetSizeMB = 1
  }

  return await (await emeth.getEstimatedGas(datasetSizeMB, algorithmComplexity)).toNumber()
}

export const estimateProcessingTime = (gas: number, powerCapacity: number) => {
  return gas * 1000000 / powerCapacity
}