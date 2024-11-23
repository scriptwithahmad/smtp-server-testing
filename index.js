import dotenv from "dotenv";
import express from "express";
import smtpRoutes from "./routes/smtp.js";

const app = express();
dotenv.config();

// Middleware setup
app.use(express.json());
app.use("/api", smtpRoutes);


app.get("/", async (req, res) => {
  try {
    res.status(200).send({
      message: "Server Running Properly!",
    });
  } catch (error) {
    console.log(error);
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));