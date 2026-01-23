import express from "express";
import { healthRoutes } from "./routes/health.routes.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(express.json());

app.use("/health", healthRoutes);

app.use(notFound);
app.use(errorHandler);
