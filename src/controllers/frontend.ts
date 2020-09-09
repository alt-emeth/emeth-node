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
    const { transactions = [], total = 0 } = await getTransactions(+offset, +limit);
    const { pages, totalPage } = pagination(+page, total, +limit);
    res.render('transactions', {
      title: 'The BURN Blockchain Explorer',
      transactions,
      pages,
      currentPage: +page,
      totalPage,
    });
  } catch (error) {
    res.render('transactions', {
      title: 'The BURN Blockchain Explorer',
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
    const { blocks = [], total = 0 } = await getBlocks(offset, +limit);
    const { pages, totalPage } = pagination(+page, total, +limit);
    res.render('blocks', {
      title: 'The BURN Blockchain Explorer',
      blocks,
      pages,
      currentPage: +page,
      totalPage,
    });
  } catch (error) {
    res.render('blocks', {
      title: 'The BURN Blockchain Explorer',
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
    transactionData.createdAt = new Date(transactionData.createdAt);
    res.render('transaction/transaction', {
      title: 'Transaction Details',
      transactionData,
    });
  } catch (error) {
    res.render('transaction/transaction', {
      title: 'Transaction Details',
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
    blockData.createdAt = new Date(blockData.createdAt);
    res.render('block/block', {
      title: 'Blocks',
      code: blockData.blockNumber,
      preBlockNumber,
      nextBlockNumber,
      blockData,
    });
  } catch (error) {
    res.render('block/block', {
      title: 'Blocks',
      code: req.params.id,
      preBlockNumber: null,
      nextBlockNumber: null,
      blockData: null,
    });
  }
};

const pagination = (page: number, total: number, totalPerPage: number, totalPageShow = 3) => {
  const totalPage = Math.ceil(total / totalPerPage);
  const totalShow = Math.min(page > totalPage ? 0 : totalPage, totalPageShow);
  const start = Math.min(Math.max(1, page - (totalShow >> 1)), totalPage - totalShow + 1);
  const pages = Array.from({ length: totalShow }, (i, index) => index + start);
  return { pages, totalPage };
};
