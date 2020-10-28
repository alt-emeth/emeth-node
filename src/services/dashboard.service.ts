import Axios from 'axios';

export const getListTableDashboard = async () => {
  try {
    const { data: resData } = await Axios.get(`/dashboard/list-table`);

    return resData.data;
  } catch (error) {
    throw new Error(`getListTableDashboard: ${error.message}`);
  }
};

export const getSummaryDashboard = async () => {
  try {
    const { data: resData } = await Axios.get(`/dashboard/summary`);

    return resData.data;
  } catch (error) {
    throw new Error(`getSummaryDashboard: ${error.message}`);
  }
};

export const getTransactions = async (offset?: number, limit?: number, address?: string) => {
  try {
    const { data: resData } = await Axios.get(`/transactions`, {
      params: {
        limit,
        address,
      },
    });

    return resData.data;
  } catch (error) {
    throw new Error(`getTransactions: ${error.message}`);
  }
};

export const getBlocks = async (offset: number, limit: number) => {
  try {
    const { data: resData } = await Axios.get(`/blocks`, {
      params: {
        offset,
        limit,
      },
    });

    return resData.data;
  } catch (error) {
    throw new Error(`getBlocks: ${error.message}`);
  }
};

export const getTokens = async (offset: number, limit: number) => {
  try {
    const { data: resData } = await Axios.get(`/tokens`, {
      params: {
        offset,
        limit,
      },
    });

    return resData.data;
  } catch (error) {
    throw new Error(`getTokens: ${error.message}`);
  }
};

export const getStores = async (offset: number, limit: number) => {
  try {
    const { data: resData } = await Axios.get(`/stores`, {
      params: {
        offset,
        limit,
      },
    });

    return resData.data;
  } catch (error) {
    throw new Error(`getStores: ${error.message}`);
  }
};

export const getTransactionDetail = async (txId: string) => {
  try {
    const { data: resData } = await Axios.get(`/tx/${txId}`);

    return resData.data;
  } catch (error) {
    throw new Error(`getTransactionDetail: ${error.message}`);
  }
};

export const getBlockDetail = async (blockNumber: number) => {
  try {
    const { data: resData } = await Axios.get(`/blocks/${blockNumber}`);

    return resData.data;
  } catch (error) {
    throw new Error(`getBlockDetail: ${error.message}`);
  }
};

export const getTokenDetail = async (tokenId: string) => {
  try {
    const { data: resData } = await Axios.get(`/tokens/${tokenId}`);

    return resData.data;
  } catch (error) {
    throw new Error(`getTokenDetail: ${error.message}`);
  }
};

export const getAddressDetail = async (address: string) => {
  try {
    const { data: resData } = await Axios.get(`/address/${address}`);

    return resData.data;
  } catch (error) {
    throw new Error(`getAddressDetail: ${error.message}`);
  }
};

export const getStoreDetail = async (address: string, offset: number, limit: number) => {
  try {
    const { data: resData } = await Axios.get(`/stores/${address}`, {
      params: {
        offset,
        limit,
      },
    });

    return resData.data;
  } catch (error) {
    throw new Error(`getStoreDetail: ${error.message}`);
  }
};

export const getKvsDetail = async (address: string, collection?: string) => {
  try {
    const { data: resData } = await Axios.get(`/kvs/${address}`, {
      params: {
        collection,
      },
    });

    return resData.data;
  } catch (error) {
    throw new Error(`getKvsDetail: ${error.message}`);
  }
};
