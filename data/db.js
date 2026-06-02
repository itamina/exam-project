'use strict';

const fs = require('fs');
const path = require('path');
const initialData = require('./initial-data');

const DB_FILE = path.join(__dirname, 'db.json');
let db;

function load() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    console.log('DBを db.json から読み込みました');
  } else {
    db = JSON.parse(JSON.stringify(initialData));
    save();
    console.log('DBを初期データから作成しました');
  }
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function get() { return db; }

function reset() {
  db = JSON.parse(JSON.stringify(initialData));
  save();
}

module.exports = { load, save, get, reset };
