import os
import shutil
from sys import argv
import subprocess

EXEC_PATH = "D:/Program Files/MuseScore 4/bin/MuseScore4.exe"

if(len(argv) < 2):
	print('Usage: musescore-wd-export-mu4 <score-file>')
	exit(3)

filename = argv[1]

if(filename[-5:] != '.mscz'):
	print('Score file must have .mscz extension.')
	exit(4)
	
if(os.path.isdir(filename) or not os.path.exists(filename)):
	print('Cannot find file ' + filename)
	exit(5)

dst_dir_name = filename + '.wd/'

if os.path.exists(dst_dir_name):
    if os.path.isfile(dst_dir_name):
        exit(1)
    # shutil.rmtree(dst_dir_name)

os.makedirs(dst_dir_name, exist_ok=True)

print("- Generating metadata")
open(dst_dir_name + 'meta.metajson', 'w', encoding='utf-8').write(
    subprocess.check_output([EXEC_PATH, '--score-meta', filename]).decode('utf-8')
)

print("- Generating SVG graphics")
subprocess.check_output([EXEC_PATH, '--export-to', dst_dir_name + 'graphic.svg', filename])

print("- Generating OGG audio")
subprocess.check_output([EXEC_PATH, '--export-to', dst_dir_name + 'audio.ogg', filename])

print("- Generating measure positions")
subprocess.check_output([EXEC_PATH, '--export-to', dst_dir_name + 'measures.mpos', filename])

print("- Generating segment positions")
subprocess.check_output([EXEC_PATH, '--export-to', dst_dir_name + 'segments.spos', filename])

