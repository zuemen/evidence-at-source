param(
  [Parameter(Mandatory=$true)][string]$SlidesDir,
  [Parameter(Mandatory=$true)][string]$VideoPath,
  [Parameter(Mandatory=$true)][string]$OutputPptx,
  [Parameter(Mandatory=$true)][string]$OutputPdf
)

$ErrorActionPreference = 'Stop'
$slideImages = Get-ChildItem -LiteralPath $SlidesDir -Filter 'slide-*.png' | Sort-Object Name
if ($slideImages.Count -ne 11) {
  throw "Expected 11 slide images, found $($slideImages.Count)"
}
if (-not (Test-Path -LiteralPath $VideoPath)) {
  throw "Video not found: $VideoPath"
}

$outputDirectory = Split-Path -Parent $OutputPptx
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$ppt = New-Object -ComObject PowerPoint.Application
$ppt.Visible = -1
try {
  $presentation = $ppt.Presentations.Add()
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540

  for ($index = 0; $index -lt $slideImages.Count; $index++) {
    $slide = $presentation.Slides.Add($index + 1, 12)
    $null = $slide.Shapes.AddPicture($slideImages[$index].FullName, $false, $true, 0, 0, 960, 540)
  }

  # The PDF is the no-video fallback, so export it before the media layer covers slide 7.
  $presentation.SaveAs($OutputPdf, 32)

  $demoSlide = $presentation.Slides.Item(7)
  $media = $demoSlide.Shapes.AddMediaObject2($VideoPath, $false, $true, 0, 0, 960, 540)
  $media.AnimationSettings.Animate = -1
  $media.AnimationSettings.PlaySettings.PlayOnEntry = -1
  $media.AnimationSettings.PlaySettings.PauseAnimation = 0
  $media.AnimationSettings.PlaySettings.HideWhileNotPlaying = 0
  $media.AnimationSettings.PlaySettings.StopAfterSlides = 0

  $presentation.SaveAs($OutputPptx, 24)
  $presentation.Close()
} finally {
  $ppt.Quit()
}

$pptxSize = (Get-Item -LiteralPath $OutputPptx).Length
$videoSize = (Get-Item -LiteralPath $VideoPath).Length
if ($pptxSize -le $videoSize) {
  throw "PPTX is not larger than embedded video; media embedding likely failed"
}

Write-Output "PPTX=$OutputPptx"
Write-Output "PDF=$OutputPdf"
Write-Output "PPTX_BYTES=$pptxSize"
Write-Output "VIDEO_BYTES=$videoSize"
