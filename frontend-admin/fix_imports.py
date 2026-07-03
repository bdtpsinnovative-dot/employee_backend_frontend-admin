import os
import glob
import re

for filepath in glob.glob('src/**/*.tsx', recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Fix the messed up imports
    content = content.replace("from \\'react\\';", "from 'react';")
    content = content.replace("from \\'react-router-dom\\';", "from 'react-router-dom';")
    content = content.replace("from \\'../lib/supabase\\';", "from '../lib/supabase';")
    content = content.replace("import React from \\'react\\';", "import React from 'react';")

    with open(filepath, 'w') as f:
        f.write(content)
