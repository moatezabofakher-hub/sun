"""Compile the exact scanner format-selection fragment against ZXing's two overloads.
This catches the Java error that blocked :app:compileReleaseJavaWithJavac in 3.5.76.
No Android SDK or Gradle download needed for this focused type check.
"""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'app/src/main/java/com/sunshine/accounting/MainActivity.java'
text = SOURCE.read_text(encoding='utf-8')
start = text.index('ScanOptions options = new ScanOptions();', text.index('public void scan(String target)'))
end = text.index('options.setPrompt(', start)
fragment = text[start:end]
assert 'options.setDesiredBarcodeFormats(ScanOptions.QR_CODE);' in fragment
assert 'options.setDesiredBarcodeFormats(ScanOptions.ALL_CODE_TYPES);' in fragment

java = '''import java.util.Collection;
class ScanOptions {
  static final String QR_CODE="QR_CODE";
  static final Collection<String> ALL_CODE_TYPES=null;
  public void setDesiredBarcodeFormats(Collection<String> formats) {}
  public void setDesiredBarcodeFormats(String... formats) {}
}
class ScanOptionsCompileCheck {
  static void check(String target) {
''' + fragment + '''
  }
}
'''
with tempfile.TemporaryDirectory(prefix='tiqany-java-check-') as d:
    p = Path(d) / 'ScanOptionsCompileCheck.java'
    p.write_text(java, encoding='utf-8')
    subprocess.run(['javac', '-encoding', 'UTF-8', '-d', d, str(p)], check=True)
print('PASS Java ScanOptions type-safe overloads (3.5.77)')
