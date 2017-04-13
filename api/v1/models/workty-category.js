'use strict';
/**
 * Created by Alex Levshin on 3/9/16.
 */
var _ = require('lodash');
_.mixin(require('lodash-deep'));
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

// Structure example:
//   social_networks
//      facebook
//      twitter
//   clouding
//      google_drive
//      dropbox
//   doc
//      conversion
//          imaging
//              png
//          html
var WorktyCategorySchema = new Schema({
    name: {type: String, required: true},
    parentId: {type: ObjectId, ref: 'workty_categories'},
    __v: {type: String, select: false}
});

// TODO: Refactor with lodash
function _findParentId(data, parentId) {
    for (var idx = 0; idx < data.length; idx++) {
        if (data[idx]._id.equals(parentId)) {
            return data[idx];
        }

        if (data[idx].categories.length > 0) {
            var parent = _findParentId(data[idx].categories, parentId);
            if (parent) {
                return parent;
            }
        }
    }

    return null;
}

// TODO: Find by full property path: { name: 'pdf.conversion.imaging.name' }
function _findIdByName(data, name) {
    for (var idx = 0; idx < data.length; idx++) {
        if (data[idx].name === name) {
            return data[idx]._id;
        }

        if (data[idx].categories.length > 0) {
            var parent = _findIdByName(data[idx].categories, name);
            if (parent) {
                return parent;
            }
        }
    }

    return null;
}

function _getCategoryPath(category) {
    var categories = [];
    categories.push(category.name);
    var parentCategory = _findParentId(_worktyCategories, category.parentId);
    while (parentCategory !== null) {
        categories.push(parentCategory.name);
        if (parentCategory.parentId !== null) {
            parentCategory = _findParentId(_worktyCategories, parentCategory.parentId);
        } else {
            parentCategory = null;
        }
    }

    // TODO: Separator for Windows
    return categories.reverse().join('/');
}

WorktyCategorySchema.statics.findByName = function (data, cb) {
    var result = _findIdByName(_worktyCategories, data);
    if (cb) {
        return cb(null, result);
    }

    return result;
};

WorktyCategorySchema.statics.getPath = function (data, cb) {
    var result = _getCategoryPath(data);
    if (cb) {
        return cb(null, result);
    }

    return result;
};

WorktyCategorySchema.statics.getAll = function (cb) {
    if (!cb) {
        return this.find({}).exec();
    }

    this.find({}, function _onWorktyCategoriesReturned(err, worktyCategories) {
        if (err) {
            cb(err);
        } else {
            if (!worktyCategories) {
                cb(null, []);
            } else {
                // TODO: update private variable
                cb(null, worktyCategories);
            }
        }
    });
};

var WorktyCategory = global.db.model('workty_categories', WorktyCategorySchema);

// Cache objects
var _stream = WorktyCategory.find({}).stream();
var _worktyCategories = [];
var _unsortedWorktyCategories = [];

_stream.on('data', function(worktyCategory) {
    var value = { _id: worktyCategory._id, parentId: worktyCategory.parentId, name: worktyCategory.name };
    value.categories = [];

    if (value.parentId === null) {
        _worktyCategories.push(value);
    } else {
        _unsortedWorktyCategories.push(value);
    }
}).on('error', function(err) {
    // Error handling
}).on('close', function(worktyCategory) {
    // All done, results object is ready
    var allDone = false;
    while (!allDone && _unsortedWorktyCategories.length > 0) {
        _.forEach(_unsortedWorktyCategories, function _onEachUnsortedWorktyCategory(unsortedWorktyCategory) {
            var parent = _findParentId(_worktyCategories, unsortedWorktyCategory.parentId);
            if (parent) {
                parent.categories.push(unsortedWorktyCategory);
                _unsortedWorktyCategories = _.without(_unsortedWorktyCategories, unsortedWorktyCategory);
                allDone = _unsortedWorktyCategories.length === 0;
                return false;
            }
        });
    }
});

module.exports.schema = WorktyCategorySchema;
module.exports.defaultModel = WorktyCategory;
module.exports.collectionName = 'workty_categories';