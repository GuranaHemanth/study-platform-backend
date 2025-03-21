const express = require("express");
const Room = require("../models/Room");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Room name is required" });

    const newRoom = new Room({
      name,
      createdBy: req.user.userId,
      members: [req.user.userId]
    });

    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate("createdBy", "username")
      .populate("members", "username");
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;