import dbModule from './src/database';

async function checkUsers() {
    await dbModule.initializeDatabase();
    const users = dbModule.getAll('SELECT * FROM users');
    console.log('--- USERS IN DATABASE ---');
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
}

checkUsers().catch(console.error);
