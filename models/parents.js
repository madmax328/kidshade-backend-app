// Simulation d’une base de données parents
const mongoose = require("mongoose");

const parentSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  photo: String,
  children: [
    {
      name: String,
      photo: String,
      createdAt: Date,
    }
  ],
}, { timestamps: true });

module.exports = mongoose.model("Parent", parentSchema);
