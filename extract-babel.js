const fs = require('fs');
const html = fs.readFileSync('src/index.html', 'utf8');
const babelScript = html.split('<script type="text/babel">')[1].split('</script>')[0];
fs.writeFileSync('test.jsx', babelScript);
