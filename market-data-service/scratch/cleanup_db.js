const path = require('path');
const { db } = require(path.join(__dirname, '..', 'src', 'database'));

db.serialize(() => {
  db.run("DELETE FROM market_series WHERE symbol LIKE 'TEST_DUP%'", function(err) {
    if (err) console.error(err);
    else console.log(`Deleted test dup rows: ${this.changes}`);
  });

  db.run("DELETE FROM market_series WHERE symbol = 'XAU' AND value < 4000", function(err) {
    if (err) console.error(err);
    else console.log(`Deleted old gold rows < 4000: ${this.changes}`);
  });

  db.run("DELETE FROM market_series WHERE provider_timestamp < 1791365000000", function(err) {
    if (err) console.error(err);
    else console.log(`Deleted old morning rows: ${this.changes}`);
  });

  setTimeout(() => process.exit(0), 1000);
});

