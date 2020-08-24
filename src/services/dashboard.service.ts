import Axios from 'axios';

export const getDashboard = async () => {
  return await Axios.get(process.env.ANTI_BLOCK_API_URL);
};
