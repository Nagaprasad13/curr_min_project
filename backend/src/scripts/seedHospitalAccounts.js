const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Practitioner = require('../models/Practitioner');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'seed-credentials.json');

function loadSeedCredentials(credentialsPath = CREDENTIALS_PATH) {
  try {
    const saved = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    return Object.fromEntries((saved.accounts || []).map(account => [account.email, account]));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new Error(`Could not read seed credentials at ${credentialsPath}: ${err.message}`);
  }
}

function generateSeedPassword() {
  return `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
}

function ensureCredential(credentials, account) {
  const saved = credentials[account.email];
  const passwordIsInUse = password => Object.entries(credentials)
    .some(([email, entry]) => email !== account.email && entry.password === password);
  let password = saved?.password;
  if (!password || passwordIsInUse(password)) {
    do {
      password = generateSeedPassword();
    } while (passwordIsInUse(password));
  }
  credentials[account.email] = { ...saved, ...account, password };
  return password;
}

function writeSeedCredentials(credentials, outputPath = CREDENTIALS_PATH) {
  const accounts = Object.values(credentials)
    .sort((left, right) => left.email.localeCompare(right.email));
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), accounts }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
}

function accountCode(hospitalCode) {
  return hospitalCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

async function seedHospitalAccounts(hospitals, credentials, credentialsPath = CREDENTIALS_PATH) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Synthetic hospital accounts must never be seeded in production.');
  }

  let createdAdmins = 0;
  let linkedDoctors = 0;

  for (const hospital of hospitals) {
    let admins = await User.find({ role: 'hospital_admin', hospitalId: hospital._id }).sort({ createdAt: 1 });
    if (!admins.length) {
      const email = `admin.${accountCode(hospital.code)}@carebridge.invalid`;
      let admin = await User.findOne({ email });
      if (admin) {
        if (admin.role !== 'hospital_admin' || !admin.isSynthetic) {
          throw new Error(`Cannot provision ${hospital.code}: generated admin email is already assigned to a non-seed account.`);
        }
        admin.hospitalId = hospital._id;
        admin.district = hospital.district;
        await admin.save();
      } else {
        const account = {
          name: `Synthetic administrator - ${hospital.name}`,
          email,
          role: 'hospital_admin',
          hospitalId: hospital._id,
          district: hospital.district,
          isSynthetic: true,
        };
        const password = ensureCredential(credentials, { ...account, hospitalCode: hospital.code });
        admin = await User.create({ ...account, password });
        createdAdmins++;
        writeSeedCredentials(credentials, credentialsPath);
      }
      admins = [admin];
    }

    if (!hospital.adminUserId || !admins.some(admin => admin._id.equals(hospital.adminUserId))) {
      hospital.adminUserId = admins[0]._id;
      await hospital.save();
    }

    const practitioners = await Practitioner.find({
      hospitalId: hospital._id,
      employmentStatus: 'active',
      verificationStatus: 'verified',
    }).sort({ practitionerId: 1 }).limit(2);

    if (practitioners.length < 2) {
      throw new Error(`${hospital.code} has fewer than two active verified practitioners; doctor accounts were not provisioned.`);
    }

    for (const practitioner of practitioners) {
      let user = practitioner.userId ? await User.findById(practitioner.userId) : null;
      if (user && (user.role !== 'doctor' || !user.hospitalId?.equals(hospital._id))) {
        throw new Error(`Linked doctor account does not match practitioner ${practitioner.practitionerId} hospital.`);
      }

      if (!user) {
        const unlinkedSeedDoctor = await User.findOne({
          role: 'doctor',
          hospitalId: hospital._id,
          isSynthetic: true,
          _id: { $nin: await Practitioner.distinct('userId', { userId: { $ne: null } }) },
        }).sort({ createdAt: 1 });
        const email = unlinkedSeedDoctor
          ? unlinkedSeedDoctor.email
          : `doctor.${practitioner.practitionerId.toLowerCase()}@carebridge.invalid`;

        if (unlinkedSeedDoctor) {
          user = unlinkedSeedDoctor;
        } else {
          user = await User.findOne({ email });
          if (user) {
            if (user.role !== 'doctor' || !user.isSynthetic || !user.hospitalId?.equals(hospital._id)) {
              throw new Error(`Cannot provision practitioner ${practitioner.practitionerId}: generated doctor email is already assigned.`);
            }
          } else {
            const account = {
              name: practitioner.fullName,
              email,
              role: 'doctor',
              hospitalId: hospital._id,
              district: hospital.district,
              isSynthetic: true,
            };
            const password = ensureCredential(credentials, {
              ...account,
              hospitalCode: hospital.code,
              practitionerId: practitioner.practitionerId,
            });
            user = await User.create({ ...account, password });
            writeSeedCredentials(credentials, credentialsPath);
          }
        }
        practitioner.userId = user._id;
        await practitioner.save();
        linkedDoctors++;
      }
    }
  }

  return { createdAdmins, linkedDoctors };
}

module.exports = {
  CREDENTIALS_PATH,
  ensureCredential,
  generateSeedPassword,
  loadSeedCredentials,
  seedHospitalAccounts,
  writeSeedCredentials,
};
