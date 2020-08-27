import { Request, Response, NextFunction } from 'express';

import { getDashboard, getTransactions, getBlocks } from '../services/dashboard.service';

export const index = async (req: Request, res: Response) => {
  res.render('index', {
    title: 'Antiblocks',
    text: 'Welcome to Antiblocks',
  });
};

export const dashboard = async (req: Request, res: Response) => {
  let transactions = [];
  let blocks = [];
  try {
    const dataDashboard = await getDashboard();
    transactions = dataDashboard.transactions[0];
    blocks = dataDashboard.blocks[0];
    const totalTransactions = dataDashboard.transactions[1];
    const totalBlocks = dataDashboard.transactions[1];

    res.render('dashboard', {
      title: 'Antiblocks | Dashboard',
      transactions,
      blocks,
      totalTransactions,
      totalBlocks,
    });
  } catch (error) {
    res.render('dashboard', {
      title: 'Antiblocks | Dashboard',
      transactions,
      blocks,
      totalTransactions: 0,
      totalBlocks: 0,
    });
  }
};

export const transactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const offset = (+page - 1) * +limit;
    const dataTransactions = await getTransactions(+offset, +limit);
    const transactions = dataTransactions[0];
    const total = dataTransactions[1];
    const { pages, totalPage } = pagination(+page, total, +limit);
    res.render('transactions', {
      title: 'Antiblocks | Dashboard',
      transactions,
      pages,
      currentPage: +page,
      totalPage,
      // totalTransactions: total,
    });
    return res;
  } catch (error) {
    res.render('transactions', {
      title: 'Antiblocks | Dashboard',
      transactions: [],
      pages: [],
      totalPage: 0,
    });
    next(error);
  }
};

export const blocks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const offset = (+page - 1) * +limit;
    const dataBlocks = await getBlocks(offset, +limit);
    const blocks = dataBlocks[0];
    const total = dataBlocks[1];
    const { pages, totalPage } = pagination(+page, total, +limit);
    res.render('blocks', {
      title: 'Antiblocks | Dashboard',
      blocks,
      pages,
      currentPage: +page,
      totalPage,
    });
    return res;
  } catch (error) {
    res.render('blocks', {
      title: 'Antiblocks | Dashboard',
      blocks: [],
      pages: [],
      totalPage: 0,
    });
    next(error);
  }
};

const pagination = (page: number, total: number, totalPerPage: number, totalPageShow = 3) => {
  const totalPage = Math.ceil(total / totalPerPage);
  const totalShow = Math.min(page > totalPage ? 0 : totalPage, totalPageShow);
  const start = Math.min(Math.max(1, page - (totalShow >> 1)), totalPage - totalShow + 1);
  const pages = Array.from({ length: totalShow }, (i, index) => index + start);
  return { pages, totalPage };
};
