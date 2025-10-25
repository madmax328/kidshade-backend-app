// routes/tracking.js
const express = require("express");
const router = express.Router();

// 🧠 Mémoire temporaire : Map<childId, { parentId, history: [...positions] }>
const locations = new Map();

// ======================================================
// 🔹 POST /tracking/update — Envoi de la position GPS
// ======================================================
router.post("/update", (req, res) => {
  console.log("🛰️ Données brutes reçues du client :", req.body);

  try {
    const { childId, parentId, coords, battery, timestamp, photo, childName } = req.body;

    if (!childId || !parentId || !coords?.lat || !coords?.lng) {
      return res.status(400).json({ msg: "Données de localisation manquantes." });
    }

    // 🔹 Objet de position unique
    const position = {
      parentId,
      coords,
      battery: battery ?? null,
      timestamp: timestamp ?? Date.now(),
      photo: photo || null,
      childName: childName || "Enfant",
    };

    // 🔹 Ajoute ou met à jour la Map
    if (!locations.has(childId)) {
      locations.set(childId, { parentId, history: [position] });
    } else {
      const existing = locations.get(childId);
      existing.history.push(position);

      // garde les 100 dernières positions max
      if (existing.history.length > 100) {
        existing.history = existing.history.slice(-100);
      }
      locations.set(childId, existing);
    }

    console.log(`📍 Nouvelle position enregistrée pour ${childName || childId}`);
    return res.json({ msg: "Position enregistrée ✅" });
  } catch (err) {
    console.error("Erreur /tracking/update :", err);
    res.status(500).json({ msg: "Erreur interne serveur." });
  }
});

// ======================================================
// 🔹 GET /tracking/:parentId — Dernière position de chaque enfant
// ======================================================
router.get("/:parentId", (req, res) => {
  try {
    const { parentId } = req.params;
    if (!parentId) return res.status(400).json({ msg: "parentId requis." });

    const childPositions = [];

    locations.forEach((data, childId) => {
      if (data.parentId === parentId && data.history.length > 0) {
        const last = data.history[data.history.length - 1];
        childPositions.push({ childId, ...last });
      }
    });

    res.json(childPositions);
  } catch (err) {
    console.error("Erreur /tracking/:parentId :", err);
    res.status(500).json({ msg: "Erreur interne serveur." });
  }
});

// ======================================================
// 🔹 GET /tracking/history/:childId — Historique complet d’un enfant
// ======================================================
router.get("/history/:childId", (req, res) => {
  try {
    const { childId } = req.params;
    if (!childId) return res.status(400).json({ msg: "childId requis." });

    const record = locations.get(childId);
    if (!record || !record.history?.length) {
      return res.status(404).json({ msg: "Aucune donnée trouvée pour cet enfant." });
    }

    res.json({
      childId,
      parentId: record.parentId,
      history: record.history,
    });
  } catch (err) {
    console.error("Erreur /tracking/history/:childId :", err);
    res.status(500).json({ msg: "Erreur interne serveur." });
  }
});

// ======================================================
// 🔹 GET /tracking/all — Voir tout (debug / admin)
// ======================================================
router.get("/", (req, res) => {
  const result = [];
  locations.forEach((data, childId) => {
    result.push({ childId, ...data });
  });
  res.json(result);
});

module.exports = router;