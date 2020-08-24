import { Request, Response } from 'express';

// import { getDashboard } from '../services/dashboard.service';

export const index = async (req: Request, res: Response) => {
  res.render('index', {
    title: 'Antiblocks',
    text: 'Welcome to Antiblocks',
  });
};

export const dashboard = async (req: Request, res: Response) => {
  const transactions = [];
  const blocks = [];
  try {
    // const dataDashboard = await getDashboard();
    // console.log(dataDashboard);
    res.render('dashboard', {
      title: 'Antiblocks | Dashboard',
      transactions,
      blocks,
    });
  } catch (error) {
    res.render('dashboard', {
      title: 'Antiblocks | Dashboard',
      transactions,
      blocks,
    });
  }
};
