import React from 'react';
import ReactDOM from 'react-dom';
import io from 'socket.io-client';
import TicketList from './components/ticketList.jsx';
import TicketSubmission from './components/ticketSubmission.jsx';
import Login from './components/login.jsx';
import Alert from './components/alert.jsx';
import Nav from './components/nav.jsx';
import Header from './components/header.jsx';
import AdminDashboard from './components/adminDashboard.jsx';
import _ from 'underscore';

class App extends React.Component {
  constructor() {
    super();
    this.state = {
      ticketList: [],
      ticketCategoryList: ['React', 'Socket.IO', 'Recursion', 'Postgres'],
      user: null,
      statistic: {},
      hasClaimed: false
    };
    this.socket = {};
  }

  componentWillMount() {
    $.ajax({
      url: '/api/users/:id',
      type: 'GET',
      async: false,
      success: (response) => {
        return response ? this.setState({ user: response.user }) : null;
      },
      error: () => {
        console.log('failed');
      }
    });
  }

  componentDidMount() {
    if (!this.state.user) { return; }
    let option = {
      id: this.state.user.id,
      role: this.state.user.role
    };
    this.socket = io({ query: option });
    this.socket.on('update or submit ticket', () => {
      return option.role === 'admin' ? this.filterTickets() : this.getTickets(option);
    });
    this.getTickets(option);
  }

  getTickets(option) {
    $.get('/api/tickets', option, (tickets) => {
      this.setState({ ticketList: tickets.tickets, statistic: _.extend(this.state.statistic, tickets.adminStatistics) });
      this.socket.emit('get wait time');
      this.socket.on('student wait time', data => this.setState({ statistic: data }));
      this.hasClaimed();
    });
  }

  submitTickets(e) {
    $('.ticket_submission_form').validate({
      rules: {
        category: 'required',
        location: 'required',
        description: 'required'
      },
      submitHandler: (form) => {
        let ticket = {
          userId: this.state.user.id,
          category: document.getElementById('ticket_submission_category').value,
          location: document.getElementById('ticket_submission_location').value,
          description: document.getElementById('ticket_submission_description').value,
          status: 'Opened'
        };
        $.ajax({
          url: '/api/tickets',
          type: 'POST',
          data: ticket,
          success: (response) => {
            this.socket.emit('refresh');
            document.getElementById('ticket_submission_location').value = '';
            document.getElementById('ticket_submission_description').value = '';
          },
          error: () => {
            console.log('Error submitting ticket');
          }
        });
      },
      errorPlacement: function(error, element) {} // Do not show error messages
    });
  }

  updateTickets(data) {
    if (data.status === 'Claimed') {
      data.claimedBy = this.state.user.id;
    }

    $.ajax({
      url: `/api/tickets/${data.id}`,
      type: 'PUT',
      data: data,
      success: (response) => {
        this.socket.emit('refresh');
      },
      error: (err) => {
        console.log('failed to update ticket');
      }
    });
  }

  filterTickets(e) {
    if (e) { e.preventDefault(); }
    let timeWindow = document.getElementById('time-window').value;
    let category = document.getElementById('select-category').value;
    let status = document.getElementById('ticket-status').value;

    let createdAt = timeWindow === 'All' ? { $lte: new Date().toISOString() }
      : { $gte: new Date(new Date() - timeWindow * 24 * 60 * 60 * 1000).toISOString() };
    if (category === 'All') { category = { $not: null }; }
    if (status === 'All') { status = { $not: null }; }
    let option = {
      id: this.state.user.id,
      role: this.state.user.role,
      category: category,
      status: status,
      createdAt: createdAt
    };
    console.log('filering tickets...');
    this.getTickets(option);
  }

  hasClaimed() {
    const ticketList = this.state.ticketList;
    for (let i = 0; i < ticketList.length; i++) {
      if (ticketList[i].claimedBy === this.state.user.id) {
        return this.setState({ hasClaimed: true });
      }
    }
    this.setState({ hasClaimed: false });
  }

  render() {
    let user = this.state.user;
    let nav = null;
    let header = null;
    let main = null;
    if (user) {
      nav = <Nav statistic={this.state.statistic} user={this.state.user} />;
      header = <Header statistic={this.state.statistic} user={this.state.user} />;
    }
    if (!user) {
      main = <Login />;
    } else if (user.role === 'student') {
      main = <TicketSubmission submitTickets={this.submitTickets.bind(this)} ticketCategoryList={this.state.ticketCategoryList}/>;
    } else if (user.role === 'mentor') {
      // render HIR view
    } else if (user.role === 'admin') {
      main = <AdminDashboard filterTickets={this.filterTickets.bind(this)} statistic={this.state.statistic} ticketCategoryList={this.state.ticketCategoryList}/>;
    }
    return (
      <div>
        <Alert />
        {nav}
        {header}
        <div className="container">
          {main}
          <TicketList user={this.state.user} ticketList={this.state.ticketList} updateTickets={this.updateTickets.bind(this)} hasClaimed={this.state.hasClaimed} />
        </div>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('app'));
