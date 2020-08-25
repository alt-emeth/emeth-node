import Axios from 'axios';

export const getDashboard = async () => {
  const url = process.env.ANTI_BLOCK_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(url);
  if (!dataRes) {
    throw new Error('Respone data error');
  }
  return dataRes;
};
