; Project files (.maqto/.kadr) show Maqto's own document icon instead of the app icon.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Maqto Project\DefaultIcon" "" "$INSTDIR\maqto-doc.ico"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
