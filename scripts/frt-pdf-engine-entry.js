import pdfMake from 'pdfmake/build/pdfmake.min.js';
import vfs from 'pdfmake/build/vfs_fonts.js';

pdfMake.addVirtualFileSystem(vfs);

export default pdfMake;
