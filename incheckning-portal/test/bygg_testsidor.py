"""Bygger testsidor av apps-script-filerna: mallens <?!= data ?> fylls i av den simulerade servern."""
import os, re
HAR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HAR, '..', 'apps-script')
UT = os.path.join(HAR, 'ut')
os.makedirs(UT, exist_ok=True)
server = ''
for f in ['Portal.gs', 'Utbildning.gs', 'Stamma.gs']:
    server += open(os.path.join(SRC, f)).read() + '\n'
server = server.replace("const PORTAL_PIN = 'ÄNDRA';", "const PORTAL_PIN = '999999';")
data = """
window.__data = function (sida) {
  if (sida === 'Portal') return { org: ORGANISATION, bas: basUrl() };
  var id = new URLSearchParams(location.search).get('e');
  var ev = hamtaEvenemang(id);
  return ev ? publikt(ev) : null;
};
"""
for sida in ['Portal', 'Utbildning', 'Stamma']:
    s = open(os.path.join(SRC, sida + '.html')).read()
    s = s.replace('<?!= data ?>', "window.__data('" + sida + "')")
    s = re.sub(r'(<script>var (EV|DATA) = )', '<script src="../mock.js"></script>\n<script>' + server.replace('\\', '\\\\') + data + '</script>\n' + r'\1', s, count=1)
    open(os.path.join(UT, sida + '.html'), 'w').write(s)
print('Testsidor i', UT)
