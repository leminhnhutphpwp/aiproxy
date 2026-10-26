const fs = require('fs');
const path = require('path');
const USER_SKILLS_DIR = path.join(__dirname, '..', '..', 'config', 'user-skills');

function ensureDir() {
  if (!fs.existsSync(USER_SKILLS_DIR)) fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
}

function userFilePath(userId) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(USER_SKILLS_DIR, safe + '.json');
}

function loadUserSkills(userId) {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(userFilePath(userId), 'utf8'));
  } catch {
    return { userId, enabledSkills: [], tokenBudget: 2000, updatedAt: null };
  }
}

function saveUserSkills(userId, data) {
  ensureDir();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(userFilePath(userId), JSON.stringify(data, null, 2), 'utf8');
}

function getEnabledSkills(userId) {
  const data = loadUserSkills(userId);
  return data.enabledSkills || [];
}

function setSkillEnabled(userId, skillId, enabled) {
  const data = loadUserSkills(userId);
  if (enabled) {
    if (!data.enabledSkills.includes(skillId)) {
      data.enabledSkills.push(skillId);
    }
  } else {
    data.enabledSkills = data.enabledSkills.filter(s => s !== skillId);
  }
  saveUserSkills(userId, data);
  return data.enabledSkills;
}

function setTokenBudget(userId, budget) {
  const data = loadUserSkills(userId);
  data.tokenBudget = Math.max(500, Math.min(budget, 16000));
  saveUserSkills(userId, data);
  return data.tokenBudget;
}

function getUserSkills(userId) {
  return loadUserSkills(userId);
}

const userSkillsService = {
  getEnabledSkills,
  setSkillEnabled,
  setTokenBudget,
  getUserSkills,
};

module.exports = userSkillsService;
