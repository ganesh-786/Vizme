import client from './client';

export const authAPI = {
  signup: async (email, password, name) => {
    const response = await client.post('/auth/signup', {
      email,
      password,
      name,
    });
    return response.data;
  },

  signin: async (email, password) => {
    const response = await client.post('/auth/signin', {
      email,
      password,
    });
    return response.data;
  },
};
