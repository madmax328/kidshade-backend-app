const express = require("express");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const children = require("../models/children");

const router = express.Router();

// 📸 Config upload
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Récupérer les enfants d’un parent
router.get("/:parentId", (req, res) => {
  const kids = children.filter((c) => c.parentId === req.params.parentId);
  res.json(kids);
});

// Ajouter un enfant
router.post("/", upload.single("photo"), (req, res) => {
  const { parentId, name } = req.body;
  if (!parentId || !name) return res.status(400).json({ message: "ParentId et nom requis" });

  const child = {
    id: uuidv4(),
    parentId,
    name,
    photo: req.file ? `/uploads/${req.file.filename}` : null,
    dailyLimit: 120,
    usedTime: 0,
    history: [],
    location: { latitude: 0, longitude: 0 },
  };

  children.push(child);
  res.json({ message: "Enfant ajouté", child });
});

// Modifier un enfant
router.put("/:id", upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const child = children.find((c) => c.id === id);

  if (!child) return res.status(404).json({ message: "Enfant non trouvé" });

  child.name = name || child.name;
  if (req.file) child.photo = `/uploads/${req.file.filename}`;

  res.json({ message: "Enfant modifié", child });
});

// Supprimer un enfant
router.delete("/:id", (req, res) => {
  const index = children.findIndex((c) => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Enfant non trouvé" });

  children.splice(index, 1);
  res.json({ message: "Enfant supprimé" });
});

module.exports = router;
