import { BigNumber } from 'ethers'
import { Emeth } from '../types/contracts'

export const computeRequiredPowerCapacity = (gas:number, timeLimit:number): number => {
  return BigNumber.from(gas).mul(BigNumber.from(1000000)).div(BigNumber.from(timeLimit)).toNumber()
}

export const estimateProcessingTime = async(datasetSizeMB: number, algorithmComplexity: number, powerCapacity: number, emeth:Emeth) => {
    const gas = await (await emeth.getEstimatedGas(datasetSizeMB, algorithmComplexity)).toNumber()

    /* deprecated
    if(datasetSizeMB >= 250) {
      powerCapacity = 50000
    }
    */

    const time = gas * 1000000 / powerCapacity

    return {gas, time}
}