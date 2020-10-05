import { Request, Response } from 'express';
import moment from 'moment';

import {
  getListTableDashboard,
  getSummaryDashboard,
  getTransactions,
  getBlocks,
  getTransactionDetail,
  getBlockDetail,
} from '../services/dashboard.service';

export const index = async (req: Request, res: Response) => {
  res.redirect('/dashboard');
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
      latestCheckPoint = 0,
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

    res.render('dashboard', {
      title: 'The BURN Blockchain Explorer',
      transactions,
      blocks,
      totalTransactions,
      totalBlocks,
      latestBlock,
      totalTokens,
      latestCheckPoint,
      totalStores,
      totalBalances,
    });
  } catch (error) {
    res.render('dashboard', {
      title: 'The BURN Blockchain Explorer',
      transactions: [],
      blocks: [],
      totalTransactions: 0,
      totalBlocks: 0,
    });
  }
};

export const transactions = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const offset = (+page - 1) * +limit;
    const dataRes = await getTransactions(+offset, +limit);
    let { transactions = [] } = dataRes;
    const { total = 0 } = dataRes;
    const { pages, totalPage } = pagination(+page, total, +limit);
    transactions = transactions.map((item) => {
      return {
        ...item,
        createdAt: moment(item.createdAt).fromNow(),
      };
    });
    res.render('transactions', {
      transactions,
      pages,
      currentPage: +page,
      totalPage,
    });
  } catch (error) {
    res.render('transactions', {
      transactions: [],
      pages: [],
      totalPage: 0,
    });
  }
};

export const blocks = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 15 } = req.query;
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
    res.render('blocks', {
      blocks,
      pages,
      currentPage: +page,
      totalPage,
    });
  } catch (error) {
    res.render('blocks', {
      blocks: [],
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
    res.render('detail/transaction', {
      title: 'Transaction',
      transactionData,
    });
  } catch (error) {
    res.render('detail/transaction', {
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
    res.render('detail/block', {
      title: 'Blocks',
      code: blockData.blockNumber,
      preBlockNumber,
      nextBlockNumber,
      blockData,
    });
  } catch (error) {
    res.render('detail/block', {
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
    if (!/^[+,-]?\d+$/.test(`${key}`)) {
      throw new Error('url invalid!');
    }
    const transactions = [
      {
        txId: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        createdAt: 'a month ago',
        source: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        target: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        quanlity: '0.45d4aw4d5a45dw455',
      },
      {
        txId: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        createdAt: 'a month ago',
        source: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        target: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        quanlity: '0.45d4aw4d5a45dw455',
      },
      {
        txId: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        createdAt: 'a month ago',
        source: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        target: '0x12345678awqdadada1212da12d2a121d2a121d21a21d21ad',
        quanlity: '0.45d4aw4d5a45dw455',
      },
    ];
    const balances = [
      {
        address: '0x12dad21a2d2a2d12a2d21a21d21ad12ad2a2d12a12d',
        quanlity: '8,123,123,12,12,122,12,12',
        percentage: '25.10150',
      },
      {
        address: '0x12dad21a2d2a2d12a2d21a21d21ad12ad2a2d12a12d',
        quanlity: '8,123,123,12,12,122,12,12',
        percentage: '25.10150',
      },
      {
        address: '0x12dad21a2d2a2d12a2d21a21d21ad12ad2a2d12a12d',
        quanlity: '8,123,123,12,12,122,12,12',
        percentage: '25.10150',
      },
    ];
    const token = {
      symbol: 'BNB',
      id: '0x12345678910112121211111111111111111111111111111111',
      decimals: 10,
      holders: 10000,
      transfers: 123456,
      totalSupply: '21212111111111111121212212122'.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,'),
    };
    res.render('detail/token', {
      title: 'Token',
      token,
      transactions,
      balances,
      url: process.env.ANTI_BLOCK_API_URL,
      pages: [1, 2, 3],
      currentPage: 2,
      totalPage: 3,
    });
  } catch (error) {
    res.render('detail/token', {
      title: 'Token',
    });
  }
};

// export const getTransfers = async (req: Request, res: Response) => {

// }

const pagination = (page: number, total: number, totalPerPage: number, totalPageShow = 3) => {
  const totalPage = Math.ceil(total / totalPerPage);
  const totalShow = Math.min(page > totalPage ? 0 : totalPage, totalPageShow);
  const start = Math.min(Math.max(1, page - (totalShow >> 1)), totalPage - totalShow + 1);
  const pages = Array.from({ length: totalShow }, (i, index) => index + start);
  return { pages, totalPage };
};
