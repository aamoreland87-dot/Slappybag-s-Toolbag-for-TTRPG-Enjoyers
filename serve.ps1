$root = Join-Path $PSScriptRoot 'serve'
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add('http://localhost:8731/')
$l.Start()
Write-Host "serving $root on 8731"
$types = @{ '.pdf'='application/pdf'; '.html'='text/html; charset=utf-8'; '.png'='image/png'; '.js'='text/javascript'; '.css'='text/css' }
while ($l.IsListening) {
  $c = $l.GetContext()
  $p = [uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
  if ($p -eq '') { $p = 'index.html' }
  $f = Join-Path $root $p
  if (Test-Path $f -PathType Leaf) {
    $b = [IO.File]::ReadAllBytes($f)
    $ext = [IO.Path]::GetExtension($f).ToLower()
    $c.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
    $c.Response.ContentLength64 = $b.Length
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
