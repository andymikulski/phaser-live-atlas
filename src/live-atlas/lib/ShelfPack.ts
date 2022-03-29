//
// Modified version of `mapbox/shelf-pack` to be a little more tailored to our needs.
// Find the original here: https://github.com/mapbox/shelf-pack
//
// -----------------------------------------
// Original `shelf-pack` license:
//
// ISC License
//
// Copyright (c) 2017, Mapbox
//
// Permission to use, copy, modify, and/or distribute this software for any purpose with or without
// fee is hereby granted, provided that the above copyright notice and this permission notice appear
// in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
// INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE
// LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING
// FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
// ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
//

/**
 * Used to denote spaces in the atlas that are free or occupied with content
 */
export class Bin {
  public refcount: number = 0;

  /**
   * Create a new Bin object.
   *
   * @class  Bin
   * @param  {number|string}  id      Unique id of the bin
   * @param  {number}         x       Left coordinate of the bin
   * @param  {number}         y       Top coordinate of the bin
   * @param  {number}         width       Width of the bin
   * @param  {number}         height       Height of the bin
   * @param  {number}         [maxw]  Max width of the bin (defaults to `w` if not provided)
   * @param  {number}         [maxh]  Max height of the bin (defaults to `h` if not provided)
   */
  constructor(
    public id: string | number,
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    public maxw?: number,
    public maxh?: number
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.maxw = maxw || width;
    this.maxh = maxh || height;
    this.refcount = 0;
  }
}

/**
 * List of `Bin`s from left to right, used to stack bins atop each other
 */
export class Shelf {
  public free = 0;
  public x = 0;
  /**
   * Create a new Shelf.
   *
   * @private
   * @class  Shelf
   * @param  {number}  y   Top coordinate of the new shelf
   * @param  {number}  w   Width of the new shelf
   * @param  {number}  h   Height of the new shelf
   * @example
   * var shelf = new Shelf(64, 512, 24);
   */
  constructor(public y: number, public width: number, public height: number) {
    this.x = 0;
    this.y = y;
    this.width = this.free = width;
    this.height = height;
  }

  /**
   * Allocate a single bin into the shelf.
   * @param   {number}         w   Width of the bin to allocate
   * @param   {number}         h   Height of the bin to allocate
   * @param   {number|string}  id  Unique id of the bin to allocate
   */
  alloc = (w: number, h: number, id: number | string): Bin => {
    if (w > this.free || h > this.height) {
      return null;
    }
    var x = this.x;
    this.x += w;
    this.free -= w;
    return new Bin(id, x, this.y, w, h, w, this.height);
  };

  /**
   * Resize the shelf.
   * @param   {number}  w  Requested new width of the shelf
   */
  resize = (w: number) => {
    this.free += w - this.width;
    this.width = w;
  };
}

/**
 * Main class for using the ShelfPack algorithm.
 */
class ShelfPack {
  public shelves: Shelf[] = [];
  public freebins: Bin[] = [];
  public bins: { [id: number | string]: Bin } = {};

  /**
   * Create a new ShelfPack bin allocator.
   *
   * Uses the Shelf Best Height Fit algorithm from
   * http://clb.demon.fi/files/RectangleBinPack.pdf
   *
   * @class  ShelfPack
   * @param  {number}  [w=64]  Initial width of the packer
   * @param  {number}  [h=64]  Initial width of the packer
   * @param  {Object}  [options]
   * @param  {boolean} [options.autoResize=false]  If `true`, the packer will automatically grow
   * @example
   * var packer = new ShelfPack(64, 64, { autoResize: false });
   */
  constructor(
    public width: number,
    public height: number,
    public autoResize = true
  ) {
    this.width = width || 0;
    this.height = height || 0;
    this.autoResize = autoResize;
    this.shelves = [];
    this.freebins = [];
    this.bins = {};
  }

  /**
   * Batch pack multiple bins into the packer.
   *
   * @param   {Object[]} bins       Array of requested bins - each object should have `width`, `height` (or `w`, `h`) properties
   * @param   {number}   bins[].width   Requested bin width
   * @param   {number}   bins[].height   Requested bin height
   * @param   {Object}   [options]
   * @param   {boolean}  [options.inPlace=false] If `true`, the supplied bin objects will be updated inplace with `x` and `y` properties
   * @returns {Bin[]}    Array of allocated Bins - each Bin is an object with `id`, `x`, `y`, `w`, `h` properties
   * @example
   * var bins = [
   *     { id: 1, w: 12, h: 12 },
   *     { id: 2, w: 12, h: 16 },
   *     { id: 3, w: 12, h: 24 }
   * ];
   * var results = packer.pack(bins, { inPlace: false });
   */
  pack = (
    bins: { id: string | number; width: number; height: number }[]
  ): Bin[] => {
    bins = [].concat(bins);

    var results = [],
      w,
      h,
      id,
      allocation;

    for (var i = 0; i < bins.length; i++) {
      w = bins[i].width;
      h = bins[i].height;
      id = bins[i].id;

      if (w && h) {
        allocation = this.packOne(w, h, id);
        if (!allocation) {
          continue;
        }
        results.push(allocation);
      }
    }

    this.shrink();

    return results;
  };

  /**
   * Pack a single bin into the packer.
   *
   * Each bin will have a unique identitifer.
   * If no identifier is supplied in the `id` parameter, one will be created.
   * Note: The supplied `id` is used as an object index, so numeric values are fastest!
   *
   * Bins are automatically refcounted (i.e. a newly packed Bin will have a refcount of 1).
   * When a bin is no longer needed, use the `ShelfPack.unref` function to mark it
   *   as unused.  When a Bin's refcount decrements to 0, the Bin will be marked
   *   as free and its space may be reused by the packing code.
   *
   * @param    {number}         w      Width of the bin to allocate
   * @param    {number}         h      Height of the bin to allocate
   * @param    {number|string}  [id]   Unique identifier for this bin, (if unsupplied, assume it's a new bin and create an id)
   * @returns  {Bin}            Bin object with `id`, `x`, `y`, `w`, `h` properties, or `null` if allocation failed
   * @example
   * var results = packer.packOne(12, 16, 'a');
   */
  packOne = (w: number, h: number, id: string | number): Bin => {
    var best = { freebin: -1, shelf: -1, waste: Infinity },
      y = 0,
      bin,
      shelf,
      waste,
      i;

    bin = this.getBin(id);
    if (bin) {
      // we packed this bin already
      this.ref(bin);
      return bin;
    }

    // First try to reuse a free bin..
    for (i = 0; i < this.freebins.length; i++) {
      bin = this.freebins[i];

      // exactly the right height and width, use it..
      if (h === bin.maxh && w === bin.maxw) {
        return this.allocFreebin(i, w, h, id);
      }
      // not enough height or width, skip it..
      if (h > bin.maxh || w > bin.maxw) {
        continue;
      }
      // extra height or width, minimize wasted area..
      if (h <= bin.maxh && w <= bin.maxw) {
        waste = bin.maxw * bin.maxh - w * h;
        if (waste < best.waste) {
          best.waste = waste;
          best.freebin = i;
        }
      }
    }

    // Next find the best shelf..
    for (i = 0; i < this.shelves.length; i++) {
      shelf = this.shelves[i];
      y += shelf.height;

      // not enough width on this shelf, skip it..
      if (w > shelf.free) {
        continue;
      }
      // exactly the right height, pack it..
      if (h === shelf.height) {
        return this.allocShelf(i, w, h, id);
      }
      // not enough height, skip it..
      if (h > shelf.height) {
        continue;
      }
      // extra height, minimize wasted area..
      if (h < shelf.height) {
        waste = (shelf.height - h) * w;
        if (waste < best.waste) {
          best.freebin = -1;
          best.waste = waste;
          best.shelf = i;
        }
      }
    }

    if (best.freebin !== -1) {
      return this.allocFreebin(best.freebin, w, h, id);
    }

    if (best.shelf !== -1) {
      return this.allocShelf(best.shelf, w, h, id);
    }

    // No free bins or shelves.. add shelf..
    if (h <= this.height - y && w <= this.width) {
      shelf = new Shelf(y, this.width, h);
      return this.allocShelf(this.shelves.push(shelf) - 1, w, h, id);
    }

    // No room for more shelves..
    // If `autoResize` option is set, grow the packer as follows:
    //  * double whichever packer dimension is smaller (`w1` or `h1`)
    //  * if packer dimensions are equal, grow width before height
    //  * accomodate very large bin requests (big `w` or `h`)
    if (this.autoResize) {
      var h1, h2, w1, w2;

      h1 = h2 = this.height;
      w1 = w2 = this.width;

      if (w1 <= h1 || w > w1) {
        // grow width..
        w2 = Math.ceil(Math.max(w, w1) * 1.25);
      }
      if (h1 < w1 || h > h1) {
        // grow height..
        h2 = Math.ceil(Math.max(h, h1) * 1.25);
      }

      this.resize(w2, h2);
      return this.packOne(w, h, id); // retry
    }

    return null;
  };

  /**
   * Called by packOne() to allocate a bin by reusing an existing freebin
   *
   * @private
   * @param    {number}         index  Index into the `this.freebins` array
   * @param    {number}         w      Width of the bin to allocate
   * @param    {number}         h      Height of the bin to allocate
   * @param    {number|string}  id     Unique identifier for this bin
   * @returns  {Bin}            Bin object with `id`, `x`, `y`, `w`, `h` properties
   * @example
   * var bin = packer.allocFreebin(0, 12, 16, 'a');
   */
  allocFreebin = (
    index: number,
    w: number,
    h: number,
    id: number | string
  ): Bin => {
    var bin = this.freebins.splice(index, 1)[0];
    bin.id = id;
    bin.width = w;
    bin.height = h;
    bin.refcount = 0;
    this.bins[id] = bin;
    this.ref(bin);
    return bin;
  };

  /**
   * Called by `packOne() to allocate bin on an existing shelf
   *
   * @private
   * @param    {number}         index  Index into the `this.shelves` array
   * @param    {number}         w      Width of the bin to allocate
   * @param    {number}         h      Height of the bin to allocate
   * @param    {number|string}  id     Unique identifier for this bin
   * @returns  {Bin}            Bin object with `id`, `x`, `y`, `w`, `h` properties
   * @example
   * var results = packer.allocShelf(0, 12, 16, 'a');
   */
  allocShelf = (index: number, w: number, h: number, id: number | string) => {
    var shelf = this.shelves[index];
    var bin = shelf.alloc(w, h, id);
    this.bins[id] = bin;
    this.ref(bin);
    return bin;
  };

  /**
   * Shrink the width/height of the packer to the bare minimum.
   * Since shelf-pack doubles first width, then height when running out of shelf space
   * this can result in fairly large unused space both in width and height if that happens
   * towards the end of bin packing.
   */
  shrink = () => {
    if (this.shelves.length > 0) {
      var w2 = 0;
      var h2 = 0;

      for (var j = 0; j < this.shelves.length; j++) {
        var shelf = this.shelves[j];
        h2 += shelf.height;
        w2 = Math.max(shelf.width - shelf.free, w2);
      }

      this.resize(w2, h2);
    }
  };

  /**
   * Return a packed bin given its id, or undefined if the id is not found
   *
   * @param    {number|string}  id  Unique identifier for this bin,
   * @returns  {Bin}            The requested bin, or undefined if not yet packed
   * @example
   * var b = packer.getBin('a');
   */
  getBin = (id: string | number) => {
    return this.bins[id];
  };

  /**
   * Increment the ref count of a bin and update statistics.
   *
   * @param    {Bin}     bin  Bin instance
   * @returns  {number}  New refcount of the bin
   * @example
   * var bin = packer.getBin('a');
   * packer.ref(bin);
   */
  ref = (bin: Bin) => {
    bin.refcount += 1;
    return bin.refcount;
  };

  /**
   * Decrement the ref count of a bin and update statistics.
   * The bin will be automatically marked as free space once the refcount reaches 0.
   *
   * @param    {Bin}     bin  Bin instance
   * @returns  {number}  New refcount of the bin
   * @example
   * var bin = packer.getBin('a');
   * packer.unref(bin);
   */
  unref = (bin: Bin) => {
    if (bin.refcount === 0) {
      return 0;
    }

    if (--bin.refcount === 0) {
      delete this.bins[bin.id];
      this.freebins.push(bin);
    }

    return bin.refcount;
  };

  /**
   * Clear the packer.  Resets everything and resets statistics.
   *
   * @example
   * packer.clear();
   */
  clear = () => {
    this.shelves = [];
    this.freebins = [];
    this.bins = {};
    this.width = 0;
    this.height = 0;
  };

  /**
   * Resize the packer.
   *
   * @param   {number}  w  Requested new packer width
   * @param   {number}  h  Requested new packer height
   * @returns {boolean} `true` if resize succeeded, `false` if failed
   * @example
   * packer.resize(256, 256);
   */
  resize = (w: number, h: number, usePOT?: boolean) => {
    if (usePOT) {
      w = Phaser.Math.Pow2.GetNext(w);
      h = Phaser.Math.Pow2.GetNext(h);
    }

    this.width = w;
    this.height = h;
    for (var i = 0; i < this.shelves.length; i++) {
      this.shelves[i].resize(w);
    }
  };
}

export default ShelfPack;