import axios from "axios";

const GRAFANA_URL = process.env.GRAFANA_URL || "http://localhost:3001";
const GRAFANA_USER = process.env.GRAFANA_ADMIN_USER || "admin";
const GRAFANA_PASS = process.env.GRAFANA_ADMIN_PASSWORD || "admin";

class GrafanaService {
  constructor() {
    this.client = axios.create({
      baseURL: GRAFANA_URL,
      auth: {
        username: GRAFANA_USER,
        password: GRAFANA_PASS,
      },
      timeout: 5000,
    });
  }

  // Get dashboard by UID
  async getDashboard(uid) {
    try {
      const response = await this.client.get(`/api/dashboards/uid/${uid}`);
      return response.data;
    } catch (error) {
      console.error("Grafana API error:", error.message);
      throw error;
    }
  }

  // Create dashboard
  async createDashboard(dashboard) {
    try {
      const response = await this.client.post("/api/dashboards/db", {
        dashboard,
      });
      return response.data;
    } catch (error) {
      console.error("Grafana API error:", error.message);
      throw error;
    }
  }

  // Get datasource
  async getDatasource(name = "Prometheus") {
    try {
      const response = await this.client.get(`/api/datasources/name/${name}`);
      return response.data;
    } catch (error) {
      console.error("Grafana API error:", error.message);
      throw error;
    }
  }

  // Check Grafana health
  async checkHealth() {
    try {
      const response = await this.client.get("/api/health");
      return {
        status: "healthy",
        database:
          response.data.database === "ok" ? "connected" : "disconnected",
        version: response.data.version,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  }
}

export const grafanaService = new GrafanaService();
