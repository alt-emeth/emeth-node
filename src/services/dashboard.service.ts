import Axios from 'axios';

export const getDashboard = async () => {
  const url = process.env.ANTI_BLOCK_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/dashboard`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};

export const getTransactions = async (offset: number, limit: number) => {
  const url = process.env.ANTI_BLOCK_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/transactions?offset=${offset}&limit=${limit}`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};

export const getBlocks = async (offset: number, limit: number) => {
  const url = process.env.ANTI_BLOCK_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/blocks?offset=${offset}&limit=${limit}`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};
