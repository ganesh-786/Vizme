import axios from 'axios';

const GRAFANA_URL = process.env.GRAFANA_URL || 'http://localhost:3001';
const GRAFANA_USER = process.env.GRAFANA_ADMIN_USER || 'admin';
const GRAFANA_PASS = process.env.GRAFANA_ADMIN_PASSWORD || 'admin';

class GrafanaService {
  constructor() {
    this.baseURL = GRAFANA_URL;
    this.auth = {
      username: GRAFANA_USER,
      password: GRAFANA_PASS
    };
  }

  // Get dashboard by UID
  async getDashboard(uid) {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/dashboards/uid/${uid}`,
        { 
          auth: this.auth,
          timeout: 5000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Grafana API error:', error.message);
      throw error;
    }
  }

  // Create dashboard
  async createDashboard(dashboard) {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/dashboards/db`,
        { dashboard },
        { 
          auth: this.auth,
          timeout: 5000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Grafana API error:', error.message);
      throw error;
    }
  }

  // Get datasource
  async getDatasource(name = 'Prometheus') {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/datasources/name/${name}`,
        { 
          auth: this.auth,
          timeout: 5000
        }
      );
      return response.data;
    } catch (error) {
      console.error('Grafana API error:', error.message);
      throw error;
    }
  }

  // Check Grafana health
  async checkHealth() {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/health`,
        { 
          auth: this.auth,
          timeout: 5000
        }
      );
      return {
        status: 'healthy',
        database: response.data.database === 'ok' ? 'connected' : 'disconnected',
        version: response.data.version
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

export const grafanaService = new GrafanaService();

