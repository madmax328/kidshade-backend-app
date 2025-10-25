const express = require("express");
const { v4: uuidv4 } = require("uuid");
const parents = require("../models/parents");

const router = express.Router();

// Inscription
router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Tous les champs sont requis" });
  }

  if (parents.find((p) => p.email === email)) {
    return res.status(400).json({ message: "Cet email est déjà utilisé" });
  }

  const parent = { id: uuidv4(), name, email, password };
  parents.push(parent);

  res.json({ message: "Compte créé", parentId: parent.id, name: parent.name });
});

// Connexion
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const parent = parents.find((p) => p.email === email && p.password === password);

  if (!parent) return res.status(401).json({ message: "Identifiants invalides" });

  res.json({ message: "Connexion réussie", parentId: parent.id, name: parent.name });
});

module.exports = router;
