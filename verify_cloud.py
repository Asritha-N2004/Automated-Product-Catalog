import httpx, secrets, json
base='https://freshwise-grocery-topaz.vercel.app'
with httpx.Client(base_url=base,timeout=60) as c:
    h=c.get('/api/health');print('Public health:',h.status_code)
    h.raise_for_status()
    email='verification-'+secrets.token_hex(6)+'@example.com';password=secrets.token_urlsafe(24)
    r=c.post('/api/auth/register',json={'name':'Deployment verification','email':email,'password':password})
    if r.status_code!=201:raise RuntimeError(f'Registration failed: {r.status_code} {r.text}')
    c.headers['Authorization']='Bearer '+r.json()['access_token'];print('Account registration: passed')
    products=c.get('/api/products');products.raise_for_status();assert len(products.json())==110
    assert c.post('/api/basket/items',json={'product_id':2,'quantity':1}).status_code==200
    result=c.post('/api/optimization/run',json={'mode':'Budget Saver'});result.raise_for_status();o=result.json()
    assert o['feasible'] and len(o['agents'])==8 and o['optimized_total']==16000,o
    applied=c.post('/api/optimization/apply',json={'optimization_id':o['id']});applied.raise_for_status();assert applied.json()['total']==16000
    order=c.post('/api/history/checkout');order.raise_for_status()
    analytics=c.get('/api/analytics/overview');analytics.raise_for_status();assert analytics.json()['total_spending']==16000
    login=c.post('/api/auth/login',json={'email':email,'password':password});login.raise_for_status()
    print(json.dumps({'registration':'passed','login':'passed','catalog_products':len(products.json()),'agents':len(o['agents']),'optimized_total_paise':16000,'savings_paise':o['savings'],'checkout':'passed','persisted_analytics':'passed'}))
