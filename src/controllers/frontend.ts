import { Request, Response } from 'express';

export const index = async (req: Request, res: Response) => {
  res.render('index', {
    title: 'Antiblocks',
    text: 'Welcome to Antiblocks',
  });
};

export const dashboard = async (req: Request, res: Response) => {
  const transactions = [];
  const blocks = [];

  res.render('dashboard', {
    title: 'Antiblocks | Dashboard',
    transactions,
    blocks,
  });
};
