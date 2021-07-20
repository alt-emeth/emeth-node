import { Request, Response } from 'express';
import moment from 'moment';
// import Web3 from 'web3';
// import { AbiItem } from 'web3-utils';

import {
  getListTableDashboard,
  getSummaryDashboard,
  getTransactions,
  getBlocks,
  getTokens,
  getStores,
  getTransactionDetail,
  getBlockDetail,
  getTokenDetail,
  getAddressDetail,
  getStoreDetail,
  getKvsDetail,
  getLogsTxs,
  getEvents,
} from '../services/dashboard.service';
import { TOKEN_SPECIAL, SELECT_LIMIT } from '../config/index';
import { addressPrefix } from '../app';
import { Erc20Tokens, Erc20TokensDtoCreate } from '../entities/erc20-tokens.entity';

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export const index = async (req: Request, res: Response) => {
  res.redirect('/dashboard');
};

export const checkAddressType = async (req: Request, res: Response) => {
  const id = req.params.id;
  let continueChecking = false;

  try {
    const { token } = await getTokenDetail(id);
    if (token) {
      return res.json({
        addressType: 'token',
      });
    }
  } catch (error) {
    continueChecking = true;
  }

  try {
    if (continueChecking) {
      const storeDetail = await getKvsDetail(id);
      if (storeDetail) {
        return res.json({
          addressType: 'store',
        });
      }
    }
  } catch (error) {
    continueChecking = true;
  }

  try {
    if (continueChecking) {
      const addressDetail = await getAddressDetail(id);
      if (addressDetail?.balances?.length > 0) {
        return res.json({
          addressType: 'address',
        });
      }
    }
  } catch (error) {
    continueChecking = true;
  }

  return res.json({
    addressType: 'dashboard',
  });
};

export const dashboard = async (req: Request, res: Response) => {
  try {
    const listTableDashboard = await getListTableDashboard();
    const summaryDashboardData = await getSummaryDashboard();
    let { transactions = [], blocks = [] } = listTableDashboard;
    const {
      totalTransactions = 0,
      totalBlocks = 0,
      latestBlock = 0,
      totalTokens = 0,
      latestCheckPoint: { checkpointNumber, publicTxHash },
      totalStores = 0,
      totalBalances = 0,
    } = summaryDashboardData;

    transactions = transactions.map((item) => {
      return {
        ...item,
        createdAt: moment(item.createdAt).fromNow(),
      };
    });
    blocks = blocks.map((item) => {
      return {
        ...item,
        createdAt: moment(item.createdAt).fromNow(),
      };
    });

    res.render('pages/dashboard', {
      transactions,
      blocks,
      totalTransactions,
      totalBlocks,
      latestBlock,
      totalTokens,
      latestCheckPoint: {
        checkpointNumber,
        publicTxHash: publicTxHash && `${process.env.ETHERSCAN_URL}/tx/${publicTxHash}`,
      },
      totalStores,
      totalBalances,
      addressPrefix,
    });
  } catch (error) {
    res.render('pages/dashboard', {
      transactions: [],
      blocks: [],
      totalTransactions: 0,
      totalBlocks: 0,
    });
  }
};

export const transactions = async (req: Request, res: Response) => {
  try {
    const address = req.params.address;
    const { page = 1, limit = SELECT_LIMIT[0] } = req.query;
    const offset = (+page - 1) * +limit;
    const dataRes = await getTransactions(+offset, +limit, address);
    let { transactions = [] } = dataRes;
    const { total = 0 } = dataRes;
    const { pages, totalPage } = pagination(+page, total, +limit);
    transactions = transactions.map((item) => {
      return {
        ...item,
        createdAt: moment(item.createdAt).fromNow(),
      };
    });
    res.render('pages/transactions', {
      transactions,
      pages,
      currentPage: +page,
      totalPage,
      selectList: SELECT_LIMIT,
      selected: SELECT_LIMIT.indexOf(Number(limit)),
      addressPrefix,
    });
  } catch (error) {
    res.render('pages/transactions', {
      transactions: [],
      pages: [],
      totalPage: 0,
    });
  }
};

export const blocks = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = SELECT_LIMIT[0] } = req.query;
    const offset = (+page - 1) * +limit;
    const dataRes = await getBlocks(offset, +limit);
    let { blocks = [] } = dataRes;
    const { total = 0 } = dataRes;
    const { pages, totalPage } = pagination(+page, total, +limit);
    blocks = blocks.map((item) => {
      return {
        ...item,
        createdAt: moment(item.createdAt).fromNow(),
      };
    });
    res.render('pages/blocks', {
      blocks,
      pages,
      currentPage: +page,
      totalPage,
      selectList: SELECT_LIMIT,
      selected: SELECT_LIMIT.indexOf(Number(limit)),
    });
  } catch (error) {
    res.render('pages/blocks', {
      blocks: [],
      pages: [],
      totalPage: 0,
    });
  }
};

export const tokens = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = SELECT_LIMIT[0] } = req.query;
    const offset = (+page - 1) * +limit;
    const dataRes = await getTokens(offset, +limit);
    let { tokens = [] } = dataRes;
    const { total = 0 } = dataRes;
    const { pages, totalPage } = pagination(+page, total, +limit);
    tokens = tokens.map((ele) => {
      return {
        ...ele,
        totalSupply: formatNumber(ele.totalSupply),
        holders: formatNumber(ele.holders),
        transfers: formatNumber(ele.transfers),
      };
    });
    res.render('pages/tokens', {
      tokens,
      total,
      pages,
      currentPage: +page,
      totalPage,
      selectList: SELECT_LIMIT,
      selected: SELECT_LIMIT.indexOf(Number(limit)),
    });
  } catch (error) {
    res.render('pages/tokens', {
      tokens: [],
      pages: [],
      totalPage: 0,
    });
  }
};

export const stores = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = SELECT_LIMIT[0] } = req.query;
    const offset = (+page - 1) * +limit;
    const { total = 0, stores = [] } = await getStores(offset, +limit);
    const { pages, totalPage } = pagination(+page, total, +limit);

    res.render('pages/kvs', {
      stores,
      pages,
      currentPage: +page,
      totalPage,
      selectList: SELECT_LIMIT,
      selected: SELECT_LIMIT.indexOf(Number(limit)),
    });
  } catch (error) {
    res.render('pages/kvs', {
      stores: [],
      pages: [],
      totalPage: 0,
    });
  }
};

export const getTransaction = async (req: Request, res: Response) => {
  try {
    const key = req.params.id;
    if (!/^0x[a-fA-F0-9]+$/.test(`${key}`)) {
      throw new Error('url invalid!');
    }
    const { transactionData } = await getTransactionDetail(key);
    const { txEvents } = await getLogsTxs(key);

    const { txTo } = transactionData;
    const erc20TokensEntity = new Erc20Tokens();
    const isTxToInErc20Tokens = await erc20TokensEntity.findByAddress(txTo);

    for (const txEvent of txEvents) {
      const { topic0, address: txEventAddress, tokenName, symbol, decimals } = txEvent;
      if (topic0 === ERC20_TRANSFER_TOPIC && !isTxToInErc20Tokens) {
        try {
          const dataErc20Tokens: Erc20TokensDtoCreate = {
            address: txEventAddress,
            name: tokenName,
            symbol,
            decimals,
          };
          erc20TokensEntity.create(dataErc20Tokens);
        } catch (error) {
          console.log(`[tokenContract] ${error}`);
          continue;
        }
      }
    }
    Object.assign(transactionData);

    res.render('page-detail/transaction', {
      title: 'Transaction',
      transactionData,
      txEvents,
      addressPrefix,
    });
  } catch (error) {
    res.render('page-detail/transaction', {
      title: 'Transaction',
      transactionData: null,
    });
  }
};

export const getBlock = async (req: Request, res: Response) => {
  try {
    const key = req.params.id;
    if (!/^[+,-]?\d+$/.test(`${key}`)) {
      throw new Error('url invalid!');
    }
    const { blockData, preBlockNumber, nextBlockNumber } = await getBlockDetail(Number(key));
    res.render('page-detail/block', {
      title: 'Blocks',
      code: blockData.blockNumber,
      url: process.env.ETHERSCAN_URL,
      preBlockNumber,
      nextBlockNumber,
      blockData,
    });
  } catch (error) {
    res.render('page-detail/block', {
      title: 'Blocks',
      code: req.params.id,
      preBlockNumber: null,
      nextBlockNumber: null,
      blockData: null,
    });
  }
};

export const getToken = async (req: Request, res: Response) => {
  try {
    const key = req.params.id;
    const { token } = await getTokenDetail(key);
    Object.assign(token, {
      totalSupply: formatNumber(token.totalSupply),
      holders: formatNumber(token.holders),
      transfers: formatNumber(token.transfers),
    });
    res.render('page-detail/token', {
      title: 'Token',
      token,
      url: process.env.BURN_API_URL,
    });
  } catch (error) {
    res.render('pages/error', {
      error,
    });
  }
};

export const getAddress = async (req: Request, res: Response) => {
  try {
    const key = req.params.id;
    const dataRes = await getAddressDetail(key);
    const { txEvents: _txEvents } = await getEvents(key);
    let { transactions = [] } = dataRes;
    const { contract, tsxContractCreator, total = 0, balances: addressDetail } = dataRes;
    transactions = transactions.map((item) => {
      return {
        ...item,
        createdAt: moment(item.createdAt).fromNow(),
      };
    });
    const txEvents = _txEvents.map((txEvent) => {
      const { topic0, topic1, topic2, topic3 } = txEvent;
      return {
        ...txEvent,
        createdAt: moment(txEvent.createdAt).fromNow(),
        topics: [topic1, topic2, topic3],
        method: topic0.substring(0, 10),
      };
    });

    res.render('page-detail/address', {
      title: contract ? 'Contract' : 'Address',
      contract,
      tsxContractCreator,
      total,
      transactions,
      addressDetail,
      nativeToken: TOKEN_SPECIAL,
      address: key.toLowerCase(),
      url: process.env.BURN_API_URL,
      addressPrefix,
      txEvents,
    });
  } catch (error) {
    res.render('pages/error', {
      error,
    });
  }
};

export const getStore = async (req: Request, res: Response) => {
  try {
    const key = req.params.id;
    const { page = 1, limit = SELECT_LIMIT[0] } = req.query;
    const offset = (+page - 1) * +limit;
    const dataRes = await getStoreDetail(key, offset, +limit);
    const { transactions = [], store: storeRes, total = 0 } = dataRes;
    const { pages, totalPage } = pagination(+page, total, +limit);
    const store = {
      ...storeRes,
      transactions,
    };
    res.render('page-detail/store', {
      title: 'Key-Value Store',
      store,
      pages,
      currentPage: +page,
      totalPage,
      url: process.env.BURN_API_URL,
      selectList: SELECT_LIMIT,
      selected: SELECT_LIMIT.indexOf(Number(limit)),
      addressPrefix,
    });
  } catch (error) {
    res.render('pages/error', {
      error,
    });
  }
};

export const keyValues = async (req: Request, res: Response) => {
  try {
    let selected = 0;
    const key = req.params.id;
    const { collection } = req.query;
    let keyValues;
    if (collection) {
      keyValues = await getKvsDetail(key, String(collection));
      selected = keyValues.collections.indexOf(String(collection));
    } else {
      keyValues = await getKvsDetail(key);
    }
    res.render('page-detail/key-values', {
      title: 'Key-Value',
      keyValues,
      selected,
    });
  } catch (error) {
    res.render('pages/error', {
      error,
    });
  }
};

const formatNumber = (s) => {
  const data = String(s).split('.');
  data[0] = data[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
  if (data.length == 1) return data[0];
  else return data.join('.');
};

const pagination = (page: number, total: number, totalPerPage: number, totalPageShow = 3) => {
  const totalPage = Math.ceil(total / totalPerPage);
  const totalShow = Math.min(page > totalPage ? 0 : totalPage, totalPageShow);
  const start = Math.min(Math.max(1, page - (totalShow >> 1)), totalPage - totalShow + 1);
  const pages = Array.from({ length: totalShow }, (i, index) => index + start);
  return { pages, totalPage };
};
