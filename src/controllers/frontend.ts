import { Request, Response, NextFunction } from 'express';

import { getDashboard, getTransactions, getBlocks } from '../services/dashboard.service';

export const index = async (req: Request, res: Response) => {
  res.redirect('/dashboard');
};

export const dashboard = async (req: Request, res: Response) => {
  try {
    const dataDashboard = await getDashboard();
    const { transactions, totalTransactions } = dataDashboard.transactions;
    const { blocks, totalBlocks } = dataDashboard.blocks;

    res.render('dashboard', {
      title: 'The BURN Blockchain Explorer',
      transactions,
      blocks,
      totalTransactions,
      totalBlocks,
    });
  } catch (error) {
    res.render('dashboard', {
      title: 'The BURN Blockchain Explorer',
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
    const { transactions, total } = await getTransactions(+offset, +limit);
    const { pages, totalPage } = pagination(+page, total, +limit);
    res.render('transactions', {
      title: 'The BURN Blockchain Explorer',
      transactions,
      pages,
      currentPage: +page,
      totalPage,
    });
    return res;
  } catch (error) {
    res.render('transactions', {
      title: 'The BURN Blockchain Explorer',
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
    const { blocks, total } = await getBlocks(offset, +limit);
    const { pages, totalPage } = pagination(+page, total, +limit);
    res.render('blocks', {
      title: 'The BURN Blockchain Explorer',
      blocks,
      pages,
      currentPage: +page,
      totalPage,
    });
    return res;
  } catch (error) {
    res.render('blocks', {
      title: 'The BURN Blockchain Explorer',
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
