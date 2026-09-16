const http = require('http');
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host:'host.docker.internal', port:4100, path, method,
      headers: {'Content-Type':'application/json', ...(token?{'Authorization':'Bearer '+token}:{}), ...(data?{'Content-Length':Buffer.byteLength(data)}:{})} };
    const r = http.request(opts, res => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve(JSON.parse(b))); });
    r.on('error',reject); if(data)r.write(data); r.end();
  });
}
async function main() {
  const login = await req('POST','/api/auth/login',{email:'admin@cloudmfg.co.id',password:'CloudERP@2026'});
  const token = login.data.token;
  const dept = await req('GET','/api/settings/departments',null,token);
  console.log('Dept endpoint:', dept.success, 'count:', (dept.data||[]).length, 'sample:', (dept.data||[])[0]?.name || 'none');
  const loc = await req('GET','/api/settings/locations',null,token);
  console.log('Loc endpoint:', loc.success, 'count:', (loc.data||[]).length, 'sample:', (loc.data||[])[0]?.name || 'none');

  // Test GET check with vendor_id
  const checks = await req('GET','/api/bank/write-checks',null,token);
  const c = (checks.data||[])[0];
  if (c) {
    console.log('Latest check:', c.check_number, 'vendor_id:', c.vendor_id, 'vendor_name:', c.vendor_name);
    const detail = await req('GET','/api/bank/checks/'+c.id,null,token);
    console.log('Detail vendor_id:', detail.data?.vendor_id, 'vendor_name:', detail.data?.vendor_name);
  }
}
main().catch(e=>console.error('ERR:',e.message));
