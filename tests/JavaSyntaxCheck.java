import javax.tools.*;
import com.sun.source.util.JavacTask;
import java.util.*;
public class JavaSyntaxCheck {
  public static void main(String[] args) throws Exception {
    JavaCompiler c=ToolProvider.getSystemJavaCompiler();
    DiagnosticCollector<JavaFileObject> d=new DiagnosticCollector<>();
    try(StandardJavaFileManager fm=c.getStandardFileManager(d,null,null)) {
      var files=fm.getJavaFileObjectsFromStrings(Arrays.asList(args));
      JavacTask t=(JavacTask)c.getTask(null,fm,d,List.of("-proc:none"),null,files);
      t.parse();
    }
    for(var item:d.getDiagnostics()) if(item.getKind()==Diagnostic.Kind.ERROR) throw new IllegalArgumentException(item.toString());
    System.out.println("PASS Android Java syntax parsing");
  }
}
