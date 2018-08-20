/* window.js
 *
 * Copyright 2018 Aral Balkan
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const {Gtk, GObject} = imports.gi

var GnomitWindow = GObject.registerClass({
  Name: 'GnomitWindow',
  GTypeName: 'GnomitWindow',
  Template: 'resource:///ind/ie/Gnomit/window.glade',
  InternalChildren: ['messageText', 'commitButton', 'cancelButton'],
}, class GnomitWindow extends Gtk.Dialog {

  _init(application) {
    super._init({
        application,
    })

  }

})