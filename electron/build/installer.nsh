; Installateur Windows de LCNDA (NSIS, inclus par electron-builder).
; PHP pour Windows a besoin du « Visual C++ Redistributable 2015-2022 » (x64) de Microsoft (vcruntime140.dll).
; S'il n'est pas déjà présent, on lance le fichier officiel de Microsoft, fourni avec l'application, en silence.
; Il reste ensuite à jour grâce à Windows Update. Fonctionne aussi sur Windows 11 ARM (PHP x64 en émulation).

!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  SetRegView lastused
  ${If} $0 != 1
    DetailPrint "Installation du composant Microsoft Visual C++ (nécessaire à PHP)…"
    ExecWait '"$INSTDIR\resources\vc_redist.x64.exe" /install /quiet /norestart' $1
    ; 0 = installé, 1638 = une version plus récente est déjà là, 3010 = installé, redémarrage conseillé
    ${If} $1 != 0
    ${AndIf} $1 != 1638
    ${AndIf} $1 != 3010
      MessageBox MB_ICONEXCLAMATION|MB_OK "Le composant Microsoft Visual C++ n'a pas pu être installé (code $1).$\r$\nLCNDA en a besoin : installe-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe"
    ${EndIf}
  ${EndIf}
!macroend
