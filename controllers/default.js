const TYPE = 'text/plain';
exports.install = function () {
    CORS();
    ROUTE('GET /', home);
    ROUTE('GET /codelist/', cl);
    ROUTE('POST /convert/', handler, ['upload'], 1024 * 50);
}

function home() {
    var self = this;

    self.view('index');
}

function cl() {
    var self = this;
    NOSQL('language').find().callback(function (err, response) {
        self.json(response)
    });
}

async function handler() {
    var self = this;
    var doc;
    var id = self.id = UID();
    var expand = self.query.expand || false;
    doc = await fromfile(self);
    var obj = {};
    obj.text = await F.Fs.readFileSync(doc + '/out.txt').toString();

    if (expand)
        obj.coordonates = await tojson(doc + '/out.hocr');

    PATH.rmdir(PATH.public('image2text/temp/' + id));
    self.json(obj);
    
}


function fromfile($) {

    return new Promise(function (resolve, reject) {
        var file = $.files[0];
        var language;

        if (!file) {
            $.invalid('@(File not found)');
            return;
        }


        if (!file.isImage() && file.type !== 'application/pdf' && file.type !== 'application/x-pdf' && file.extension !== 'docx') {
            $.invalid('@(Un supported File format)')
            return;
        }


        if ($.query.language) {

            var len = $.query.language.length;
            var builder = NOSQL('language').one();

            if (len === 2)
                builder.id($.query.language)
            else
                builder.where('name', $.query.language);

            builder.callback(function (err, response) {
                console.log(response);
                if (response)
                    language = response.name;
            });
        };

        var obj = {};
        obj.id = $.id;
        obj.input = NOW.format('dd.MM.yyyy-HH:mm') + '_document_' + obj.id + '.' + file.extension;
        obj.convert = NOW.format('dd.MM.yyyy-HH:mm') + '_document_' + obj.id + '.tiff';
        obj.inputpath = PATH.public('image2text/image/' + obj.input);
        obj.convertpath = PATH.public('image2text/convert/' + obj.convert);
        obj.outputpath = PATH.public('image2text/temp/' + obj.id);

        var uploadedfile = F.Fs.readFileSync(file.path);

        PATH.mkdir(PATH.public('image2text/temp/' + obj.id));

        F.Fs.writeFile(obj.inputpath, uploadedfile, async function (err, res) {
            if (err) {
                $.invalid(err);
                reject();
            } else {
                await emptyfile(obj.outputpath);
                var converted = await convert(obj, $);
                var command = 'tesseract {3} {2} {0}  {1}/out hocr txt'.format(converted ? obj.convertpath : obj.inputpath, obj.outputpath, CONF.tessdata ? '--tessdata-dir'  + CONF.tessdata : '', language ? ' -l ' + language : '');
                console.log(command);
                SHELL(command, function (err, response) {
                    if (err) {
                        $.invalid('Error: ' + err);
                        reject();
                    } else {
                        PATH.unlink(obj.convertpath);
                        PATH.unlink(obj.inputpath);
                        resolve(obj.outputpath);
                    }

                });
            }

        });
    });
};

function convert(opt, $) {
    return new Promise(function (resolve, reject) {
        var command = 'convert -density 300 {0} -depth 8 -strip -background white -alpha off {1}'.format(opt.inputpath, opt.convertpath);
        SHELL(command, function (err, response) {
            if (err) {
                $.invalid('Error: ' + err);
                reject();
            } else
                resolve(true);
        });
    });
}

function tojson(path) {
    const Hocr = require('node-hocr');

    return new Promise(function (resolve, reject) {
        F.Fs.readFile(path, 'utf8', function (err, data) {
            new Hocr.Hocr(data.toString(), function (err, res) {
                if (err)
                    reject()
                else
                    resolve(res);
            });
        });
    });
}

function emptyfile(path) {
    return new Promise(function (resolve, reject) {
        F.Fs.writeFile(path + '/out.txt', '', function (err) {
            if (err)
                reject();
            else
                resolve(true);
        })

    });
}