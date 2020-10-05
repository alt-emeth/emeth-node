import Axios from 'axios';

export const getListTableDashboard = async () => {
  const url = process.env.BURN_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/dashboard/list-table`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};

export const getSummaryDashboard = async () => {
  const url = process.env.BURN_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/dashboard/summary`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};

export const getTransactions = async (offset: number, limit: number) => {
  const url = process.env.BURN_API_URL;
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
  const url = process.env.BURN_API_URL;
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

export const getTransactionDetail = async (txId: string) => {
  const url = process.env.BURN_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/tx/${txId}`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};

export const getBlockDetail = async (blockNumber: number) => {
  const url = process.env.BURN_API_URL;
  if (!url) {
    throw new Error('URL does not exist!');
  }
  const dataRes = await Axios.get(`${url}/blocks/${blockNumber}`);
  if (!dataRes) {
    throw new Error('Respone is error!');
  }
  if (dataRes.data.status !== 'success' || dataRes.data.code !== 200) {
    throw new Error('Internal server error');
  }
  return dataRes.data.data;
};
