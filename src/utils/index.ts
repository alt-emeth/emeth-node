import { toBN } from 'web3-utils';

export const hexToDecimal = (hexStr: string, decimals: number) => {
  const str = toBN(hexStr).toString();
  const strPad = str.padStart(str.length + decimals, '0');
  const intStr = strPad.substr(0, strPad.length - decimals).replace(/^0+/, '');
  const decStr = strPad.substr(strPad.length - decimals).replace(/0+$/, '');
  const result = decStr ? (intStr ? intStr + '.' + decStr : '0.' + decStr) : intStr;
  return result;
};
